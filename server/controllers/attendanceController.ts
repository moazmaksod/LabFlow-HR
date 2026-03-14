import { Request, Response } from 'express';
import db from '../db/index.js';
import { getDateStringInTimezone } from '../utils/dateUtils.js';

// Haversine formula to calculate distance between two points in meters
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
};

export const clockAttendance = (req: Request, res: Response): void => {
    try {
        const userId = (req as any).user.id;
        const { type, lat, lng, deviceId } = req.body;
        const timestamp = new Date().toISOString(); // Server is the single source of truth

        if (!type || !['check_in', 'check_out'].includes(type) || lat === undefined || lng === undefined || !deviceId) {
            res.status(400).json({ error: 'Missing required fields or deviceId' });
            return;
        }

        // Device Binding Security Check
        const profile = db.prepare('SELECT device_id FROM profiles WHERE user_id = ?').get(userId) as any;
        if (!profile.device_id) {
            // First time clocking in, bind device
            // Check if this device is already registered to someone else
            const existingDevice = db.prepare('SELECT user_id FROM profiles WHERE device_id = ?').get(deviceId) as any;
            if (existingDevice) {
                res.status(403).json({ error: 'Security Alert: This device is already registered to another employee. One device per employee is allowed.' });
                return;
            }
            db.prepare('UPDATE profiles SET device_id = ? WHERE user_id = ?').run(deviceId, userId);
        } else if (profile.device_id !== deviceId) {
            res.status(403).json({ error: 'Security Alert: You are trying to clock in from an unauthorized device. Please use your registered phone or contact the manager.' });
            return;
        }

        // Fetch company settings for geofence validation
        const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
        if (settings) {
            const distance = calculateDistance(lat, lng, settings.office_lat, settings.office_lng);
            if (distance > settings.radius_meters) {
                res.status(403).json({ error: 'Away from job: You are outside the allowed geofence area' });
                return;
            }
        }

        // Extract date from timestamp (YYYY-MM-DD) based on company timezone
        const timezone = settings?.timezone || 'UTC';
        const date = getDateStringInTimezone(timestamp, timezone);

        // Check if there is an active session (not checked out)
        let activeSession;
        if (type === 'check_in') {
            activeSession = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ? AND check_out IS NULL').get(userId, date) as any;
        } else {
            activeSession = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND check_out IS NULL ORDER BY check_in DESC LIMIT 1').get(userId) as any;
        }

        if (type === 'check_in') {
            if (activeSession) {
                res.status(400).json({ error: 'You already have an active session for today. Please check out first.' });
                return;
            }

            // Determine status (on_time or late_in) based on weekly_schedule
            let status = 'on_time';
            const userProfile = db.prepare(`
                SELECT p.weekly_schedule, j.grace_period, p.allow_overtime, p.max_overtime_hours
                FROM profiles p
                LEFT JOIN jobs j ON p.job_id = j.id
                WHERE p.user_id = ?
            `).get(userId) as any;

            if (userProfile && userProfile.weekly_schedule) {
                try {
                    const schedule = JSON.parse(userProfile.weekly_schedule);
                    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                    const todayName = days[new Date(timestamp).getDay()];
                    const todaySchedule = schedule[todayName];

                    if (Array.isArray(todaySchedule) && todaySchedule.length > 0) {
                        const clockInTime = new Date(timestamp);
                        
                        // Find closest shift
                        let closestShift = todaySchedule[0];
                        let minDiff = Infinity;
                        
                        todaySchedule.forEach(shift => {
                            const [schedHours, schedMinutes] = shift.start.split(':').map(Number);
                            const scheduledTime = new Date(timestamp);
                            scheduledTime.setHours(schedHours, schedMinutes, 0, 0);
                            
                            const diff = Math.abs(clockInTime.getTime() - scheduledTime.getTime());
                            if (diff < minDiff) {
                                minDiff = diff;
                                closestShift = shift;
                            }
                        });

                        const [schedHours, schedMinutes] = closestShift.start.split(':').map(Number);
                        const scheduledTime = new Date(timestamp);
                        scheduledTime.setHours(schedHours, schedMinutes, 0, 0);

                        const diffMinutes = (clockInTime.getTime() - scheduledTime.getTime()) / (1000 * 60);
                        const gracePeriod = userProfile.grace_period || 15;

                        if (diffMinutes > gracePeriod) {
                            status = 'late_in';
                        } else {
                            status = 'on_time';
                        }
                    } else if (todaySchedule && !todaySchedule.isOff && todaySchedule.start) {
                        // Legacy support
                        const [schedHours, schedMinutes] = todaySchedule.start.split(':').map(Number);
                        const clockInTime = new Date(timestamp);
                        const scheduledTime = new Date(timestamp);
                        scheduledTime.setHours(schedHours, schedMinutes, 0, 0);

                        const diffMinutes = (clockInTime.getTime() - scheduledTime.getTime()) / (1000 * 60);
                        const gracePeriod = userProfile.grace_period || 15;

                        if (diffMinutes > gracePeriod) {
                            status = 'late_in';
                        } else {
                            status = 'on_time';
                        }
                    }
                } catch (e) {
                    console.error('Error parsing weekly schedule:', e);
                }
            }

            // Insert new check-in record
            const insert = db.prepare(`
                INSERT INTO attendance (user_id, check_in, date, location_lat, location_lng, status)
                VALUES (?, ?, ?, ?, ?, ?)
            `);
            
            const info = insert.run(userId, timestamp, date, lat, lng, status);
            const newRecord = db.prepare('SELECT * FROM attendance WHERE id = ?').get(info.lastInsertRowid);
            
            // Strict evaluation block for early punch in
            if (userProfile && userProfile.weekly_schedule) {
                try {
                    const schedule = JSON.parse(userProfile.weekly_schedule);
                    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                    const todayName = days[new Date(timestamp).getDay()];
                    const todaySchedule = schedule[todayName];

                    if (Array.isArray(todaySchedule) && todaySchedule.length > 0) {
                        const clockInTime = new Date(timestamp);
                        let closestShift = todaySchedule[0];
                        let minDiff = Infinity;
                        
                        todaySchedule.forEach(shift => {
                            const [schedHours, schedMinutes] = shift.start.split(':').map(Number);
                            const scheduledTime = new Date(timestamp);
                            scheduledTime.setHours(schedHours, schedMinutes, 0, 0);
                            
                            const diff = Math.abs(clockInTime.getTime() - scheduledTime.getTime());
                            if (diff < minDiff) {
                                minDiff = diff;
                                closestShift = shift;
                            }
                        });

                        const [schedHours, schedMinutes] = closestShift.start.split(':').map(Number);
                        const scheduledTime = new Date(timestamp);
                        scheduledTime.setHours(schedHours, schedMinutes, 0, 0);

                        const diffMinutes = (clockInTime.getTime() - scheduledTime.getTime()) / (1000 * 60);
                        const gracePeriod = userProfile.grace_period || 15;

                        // Punched in early
                        if (diffMinutes < -gracePeriod) {
                            const otMinutes = Math.floor(Math.abs(diffMinutes));
                            const maxOtMinutes = (userProfile.max_overtime_hours || 0) * 60;
                            const requestedOtMinutes = maxOtMinutes > 0 ? Math.min(otMinutes, maxOtMinutes) : otMinutes;
                            
                            db.prepare(`
                                INSERT INTO requests (user_id, type, reference_id, attendance_id, reason, details, status) 
                                VALUES (?, 'overtime_approval', ?, ?, ?, ?, 'pending')
                            `).run(
                                userId, 
                                info.lastInsertRowid, 
                                info.lastInsertRowid, 
                                `Early clock-in by ${otMinutes} minutes`,
                                JSON.stringify({ raw_overtime_minutes: otMinutes, requested_overtime_minutes: requestedOtMinutes })
                            );
                        }
                    }
                } catch (e) {
                    console.error('Error in early punch-in check:', e);
                }
            }

            res.status(201).json(newRecord);
        } else if (type === 'check_out') {
            if (!activeSession) {
                res.status(400).json({ error: 'No active check-in record found for today' });
                return;
            }

            // Update check-out record
            db.prepare(`
                UPDATE attendance 
                SET check_out = ?, location_lat = ?, location_lng = ?
                WHERE id = ?
            `).run(timestamp, lat, lng, activeSession.id);

            const updatedRecord = db.prepare('SELECT * FROM attendance WHERE id = ?').get(activeSession.id) as any;
            
            // Strict evaluation block for late punch out and early punch out
            const userProfile = db.prepare(`
                SELECT p.weekly_schedule, j.grace_period, p.allow_overtime, p.max_overtime_hours
                FROM profiles p
                LEFT JOIN jobs j ON p.job_id = j.id
                WHERE p.user_id = ?
            `).get(userId) as any;

            if (userProfile && userProfile.weekly_schedule) {
                try {
                    const schedule = JSON.parse(userProfile.weekly_schedule);
                    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                    const todayName = days[new Date(activeSession.check_in).getDay()];
                    const todaySchedule = schedule[todayName];

                    if (Array.isArray(todaySchedule) && todaySchedule.length > 0) {
                        const clockOutTime = new Date(timestamp);
                        
                        // Find closest shift based on end time
                        let closestShift = todaySchedule[0];
                        let minDiff = Infinity;
                        
                        todaySchedule.forEach(shift => {
                            const [schedHours, schedMinutes] = shift.end.split(':').map(Number);
                            const scheduledTime = new Date(activeSession.check_in);
                            scheduledTime.setHours(schedHours, schedMinutes, 0, 0);
                            
                            // Handle midnight crossing for shift end
                            const [startHours, startMinutes] = shift.start.split(':').map(Number);
                            if (schedHours < startHours || (schedHours === startHours && schedMinutes < startMinutes)) {
                                scheduledTime.setDate(scheduledTime.getDate() + 1);
                            }
                            
                            const diff = Math.abs(clockOutTime.getTime() - scheduledTime.getTime());
                            if (diff < minDiff) {
                                minDiff = diff;
                                closestShift = shift;
                            }
                        });

                        const [schedHours, schedMinutes] = closestShift.end.split(':').map(Number);
                        const scheduledTime = new Date(activeSession.check_in);
                        scheduledTime.setHours(schedHours, schedMinutes, 0, 0);
                        
                        // Handle midnight crossing for shift end
                        const [startHours, startMinutes] = closestShift.start.split(':').map(Number);
                        if (schedHours < startHours || (schedHours === startHours && schedMinutes < startMinutes)) {
                            scheduledTime.setDate(scheduledTime.getDate() + 1);
                        }

                        const diffMinutes = (clockOutTime.getTime() - scheduledTime.getTime()) / (1000 * 60);
                        const gracePeriod = userProfile.grace_period || 15;

                        if (diffMinutes > gracePeriod) {
                            // Create pending overtime request for late punch out
                            const otMinutes = Math.floor(diffMinutes);
                            
                            // Check max overtime hours
                            const maxOtMinutes = (userProfile.max_overtime_hours || 0) * 60;
                            const requestedOtMinutes = maxOtMinutes > 0 ? Math.min(otMinutes, maxOtMinutes) : otMinutes;
                            
                            if (requestedOtMinutes > 0) {
                                db.prepare(`
                                    INSERT INTO requests (user_id, type, reference_id, attendance_id, reason, details, status)
                                    VALUES (?, 'overtime_approval', ?, ?, ?, ?, 'pending')
                                `).run(
                                    userId, 
                                    activeSession.id,
                                    activeSession.id, 
                                    `System detected ${otMinutes} minutes of overtime.`,
                                    JSON.stringify({ raw_overtime_minutes: otMinutes, requested_overtime_minutes: requestedOtMinutes })
                                );
                            }
                        } else if (diffMinutes < -gracePeriod) {
                            // Create pending early leave request for early punch out
                            const earlyMinutes = Math.floor(Math.abs(diffMinutes));
                            
                            // Update status to early_out if they were on_time
                            db.prepare(`
                                UPDATE attendance 
                                SET status = CASE WHEN status = 'on_time' THEN 'early_out' ELSE status END
                                WHERE id = ?
                            `).run(activeSession.id);

                            db.prepare(`
                                INSERT INTO requests (user_id, type, reference_id, attendance_id, reason, details, status)
                                VALUES (?, 'early_leave_approval', ?, ?, ?, ?, 'pending')
                            `).run(
                                userId, 
                                activeSession.id,
                                activeSession.id, 
                                `System detected early leave by ${earlyMinutes} minutes.`,
                                JSON.stringify({ early_leave_minutes: earlyMinutes })
                            );
                        }
                    }
                } catch (e) {
                    console.error('Error parsing weekly schedule for OT:', e);
                }
            }

            res.json(updatedRecord);
        }
    } catch (error) {
        console.error('Error clocking attendance:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const syncOfflineLogs = (req: Request, res: Response): void => {
    try {
        const userId = (req as any).user.id;
        const { logs } = req.body;

        if (!Array.isArray(logs) || logs.length === 0) {
            res.status(400).json({ error: 'Invalid or empty logs array' });
            return;
        }

        const syncTransaction = db.transaction((logsToSync) => {
            const settingsForTz = db.prepare('SELECT timezone FROM settings WHERE id = 1').get() as any;
            const timezone = settingsForTz?.timezone || 'UTC';

            const results = [];
            const currentServerTime = Date.now();
            
            for (const log of logsToSync) {
                const { type, delay_in_milliseconds, lat, lng } = log;
                
                // Calculate true historical time securely
                const delay = typeof delay_in_milliseconds === 'number' ? delay_in_milliseconds : 0;
                const timestamp = new Date(currentServerTime - delay).toISOString();
                
                const date = getDateStringInTimezone(timestamp, timezone);
                
                let existingRecord;
                if (type === 'check_in') {
                    existingRecord = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(userId, date) as any;
                } else {
                    existingRecord = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND check_out IS NULL ORDER BY check_in DESC LIMIT 1').get(userId) as any;
                }

                if (type === 'check_in') {
                    if (!existingRecord) {
                        const info = db.prepare(`
                            INSERT INTO attendance (user_id, check_in, date, location_lat, location_lng, status)
                            VALUES (?, ?, ?, ?, ?, 'on_time')
                        `).run(userId, timestamp, date, lat, lng);
                        results.push({ logId: log.id, status: 'success', action: 'inserted' });
                    } else {
                        results.push({ logId: log.id, status: 'skipped', reason: 'already checked in' });
                    }
                } else if (type === 'check_out') {
                    if (existingRecord && !existingRecord.check_out) {
                        db.prepare(`
                            UPDATE attendance 
                            SET check_out = ?, location_lat = ?, location_lng = ?
                            WHERE id = ?
                        `).run(timestamp, lat, lng, existingRecord.id);
                        results.push({ logId: log.id, status: 'success', action: 'updated' });
                    } else {
                        results.push({ logId: log.id, status: 'skipped', reason: 'no check-in or already checked out' });
                    }
                }
            }
            return results;
        });

        const syncResults = syncTransaction(logs);
        res.json({ message: 'Sync completed', results: syncResults });
    } catch (error) {
        console.error('Error syncing offline logs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getMyLogs = (req: Request, res: Response): void => {
    try {
        const userId = (req as any).user.id;
        const logs = db.prepare(`
            SELECT * FROM attendance 
            WHERE user_id = ? 
            ORDER BY date DESC, check_in DESC
        `).all(userId) as any[];

        if (logs.length > 0) {
            const attendanceIds = logs.map(l => l.id);
            const placeholders = attendanceIds.map(() => '?').join(',');
            const breaks = db.prepare(`SELECT * FROM shift_interruptions WHERE attendance_id IN (${placeholders})`).all(...attendanceIds) as any[];
            const requests = db.prepare(`SELECT * FROM requests WHERE attendance_id IN (${placeholders})`).all(...attendanceIds) as any[];

            logs.forEach(log => {
                log.breaks = breaks.filter(b => b.attendance_id === log.id);
                log.requests = requests.filter(r => r.attendance_id === log.id);
            });
        }

        res.json(logs);
    } catch (error) {
        console.error('Error fetching my attendance logs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getAttendanceLogs = (req: Request, res: Response): void => {
    try {
        const logs = db.prepare(`
            SELECT a.*, u.name as user_name, j.title as job_title
            FROM attendance a
            JOIN users u ON a.user_id = u.id
            LEFT JOIN profiles p ON u.id = p.user_id
            LEFT JOIN jobs j ON p.job_id = j.id
            ORDER BY a.date DESC, a.check_in DESC
        `).all() as any[];

        if (logs.length > 0) {
            const attendanceIds = logs.map(l => l.id);
            const placeholders = attendanceIds.map(() => '?').join(',');
            const breaks = db.prepare(`SELECT * FROM shift_interruptions WHERE attendance_id IN (${placeholders})`).all(...attendanceIds) as any[];
            const requests = db.prepare(`SELECT * FROM requests WHERE attendance_id IN (${placeholders})`).all(...attendanceIds) as any[];

            logs.forEach(log => {
                log.breaks = breaks.filter(b => b.attendance_id === log.id);
                log.requests = requests.filter(r => r.attendance_id === log.id);
            });
        }

        res.json(logs);
    } catch (error) {
        console.error('Error fetching attendance logs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getAttendanceStats = (req: Request, res: Response): void => {
    try {
        const statusDist = db.prepare('SELECT status as name, COUNT(*) as value FROM attendance GROUP BY status').all();
        
        const dailyHours = db.prepare(`
            SELECT date, ROUND(SUM((julianday(check_out) - julianday(check_in)) * 24), 2) as hours
            FROM attendance
            WHERE check_out IS NOT NULL
            GROUP BY date
            ORDER BY date ASC
            LIMIT 7
        `).all();

        const settingsForTz = db.prepare('SELECT timezone FROM settings WHERE id = 1').get() as any;
        const timezone = settingsForTz?.timezone || 'UTC';
        const todayDateStr = getDateStringInTimezone(new Date(), timezone);

        const todayStats = db.prepare(`
            SELECT 
                SUM(CASE WHEN status = 'on_time' THEN 1 ELSE 0 END) as present,
                SUM(CASE WHEN status = 'late_in' THEN 1 ELSE 0 END) as late,
                SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent
            FROM attendance
            WHERE date = ?
        `).get(todayDateStr) as any;

        res.json({
            statusDistribution: statusDist,
            dailyHours: dailyHours,
            today: {
                present: todayStats?.present || 0,
                late: todayStats?.late || 0,
                absent: todayStats?.absent || 0
            }
        });
    } catch (error) {
        console.error('Error fetching attendance stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const stepAway = (req: Request, res: Response): void => {
    try {
        const userId = (req as any).user.id;
        const { deviceId } = req.body;
        const timestamp = new Date().toISOString(); // Server is the single source of truth

        if (!deviceId) {
            res.status(400).json({ error: 'Missing deviceId' });
            return;
        }

        // Device Binding Security Check
        const profile = db.prepare('SELECT device_id FROM profiles WHERE user_id = ?').get(userId) as any;
        if (!profile.device_id || profile.device_id !== deviceId) {
            res.status(403).json({ error: 'Security Alert: Unauthorized device.' });
            return;
        }

        const activeAttendance = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND check_out IS NULL ORDER BY check_in DESC LIMIT 1').get(userId) as any;

        if (!activeAttendance) {
            res.status(400).json({ error: 'No active attendance found for today' });
            return;
        }

        if (activeAttendance.current_status === 'away') {
            res.status(400).json({ error: 'Already stepped away' });
            return;
        }

        const breakProfile = db.prepare('SELECT lunch_break_minutes FROM profiles WHERE user_id = ?').get(userId) as any;
        const hasBreakBalance = breakProfile && breakProfile.lunch_break_minutes > 0;

        const status = hasBreakBalance ? 'auto_approved' : 'pending_manager';

        const stepAwayTransaction = db.transaction(() => {
            // Update attendance status
            db.prepare('UPDATE attendance SET current_status = ? WHERE id = ?').run('away', activeAttendance.id);

            // Insert shift interruption
            const insertInterruption = db.prepare(`
                INSERT INTO shift_interruptions (attendance_id, start_time, type, status)
                VALUES (?, ?, 'step_away', ?)
            `);
            const info = insertInterruption.run(activeAttendance.id, timestamp, status);
            const interruptionId = info.lastInsertRowid;

            // If no break balance, create a request
            if (!hasBreakBalance) {
                db.prepare(`
                    INSERT INTO requests (user_id, attendance_id, type, reference_id, reason, status)
                    VALUES (?, ?, 'permission_to_leave', ?, 'Step away with 0 break balance', 'pending')
                `).run(userId, activeAttendance.id, interruptionId);
            }

            return { interruptionId, status };
        });

        const result = stepAwayTransaction();

        res.status(201).json({ 
            message: 'Stepped away successfully', 
            status: result.status,
            interruptionId: result.interruptionId,
            hasBreakBalance
        });
    } catch (error) {
        console.error('Error stepping away:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const resumeWork = (req: Request, res: Response): void => {
    try {
        const userId = (req as any).user.id;
        const { deviceId } = req.body;
        const timestamp = new Date().toISOString(); // Server is the single source of truth

        if (!deviceId) {
            res.status(400).json({ error: 'Missing deviceId' });
            return;
        }

        // Device Binding Security Check
        const profile = db.prepare('SELECT device_id FROM profiles WHERE user_id = ?').get(userId) as any;
        if (!profile.device_id || profile.device_id !== deviceId) {
            res.status(403).json({ error: 'Security Alert: Unauthorized device.' });
            return;
        }

        const activeAttendance = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND check_out IS NULL ORDER BY check_in DESC LIMIT 1').get(userId) as any;

        if (!activeAttendance) {
            res.status(400).json({ error: 'No active attendance found for today' });
            return;
        }

        if (activeAttendance.current_status === 'working') {
            res.status(400).json({ error: 'Already working' });
            return;
        }

        const activeInterruption = db.prepare(`
            SELECT * FROM shift_interruptions 
            WHERE attendance_id = ? AND end_time IS NULL 
            ORDER BY start_time DESC LIMIT 1
        `).get(activeAttendance.id) as any;

        if (!activeInterruption) {
            res.status(400).json({ error: 'No active interruption found' });
            return;
        }

        const resumeTransaction = db.transaction(() => {
            // Update interruption end_time
            db.prepare('UPDATE shift_interruptions SET end_time = ? WHERE id = ?').run(timestamp, activeInterruption.id);

            // Update attendance status
            db.prepare('UPDATE attendance SET current_status = ? WHERE id = ?').run('working', activeAttendance.id);
        });

        resumeTransaction();

        res.json({ message: 'Resumed work successfully' });
    } catch (error) {
        console.error('Error resuming work:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
