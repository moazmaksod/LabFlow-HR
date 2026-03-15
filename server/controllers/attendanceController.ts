import { Request, Response } from 'express';
import db from '../db/index.js';
import { getDateStringInTimezone } from '../utils/dateUtils.js';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import { getLogicalShiftDetails } from '../utils/shiftUtils.js';

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

// getClosestShift has been moved and refactored as getLogicalShiftDetails in shiftUtils.ts
export { getLogicalShiftDetails } from '../utils/shiftUtils.js';

export const clockAttendance = (req: AuthRequest, res: Response): void => {
    try {
        const userId = req.user!.id;
        const { type, lat, lng, deviceId } = req.body;
        const timestamp = new Date().toISOString(); // Server is the single source of truth

        if (!type || !['check_in', 'check_out'].includes(type) || lat === undefined || lng === undefined || !deviceId) {
            res.status(400).json({ error: 'Missing required fields or deviceId' });
            return;
        }

        // Fetch user profile and status
        const userProfile = db.prepare(`
            SELECT p.status, p.device_id, p.weekly_schedule, j.grace_period, p.allow_overtime, p.max_overtime_hours
            FROM profiles p
            LEFT JOIN jobs j ON p.job_id = j.id
            WHERE p.user_id = ?
        `).get(userId) as any;

        if (!userProfile) {
            res.status(404).json({ error: 'User profile not found' });
            return;
        }

        // 1. Inactive Status Check
        if (userProfile.status === 'inactive') {
            res.status(403).json({ error: 'Action Blocked: Your account status is "Inactive". You can login but cannot clock in or out. Please contact HR.' });
            return;
        }

        // 2. Device Binding Security Check
        if (!userProfile.device_id) {
            // First time clocking in, bind device
            // Check if this device is already registered to someone else
            const existingDevice = db.prepare('SELECT user_id FROM profiles WHERE device_id = ?').get(deviceId) as any;
            if (existingDevice && existingDevice.user_id !== userId) {
                res.status(403).json({ error: 'Security Alert: This device is already registered to another employee. One device per employee is allowed.' });
                return;
            }
            db.prepare('UPDATE profiles SET device_id = ? WHERE user_id = ?').run(deviceId, userId);
        } else if (userProfile.device_id !== deviceId) {
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

        const timezone = settings?.timezone || 'UTC';

        let schedule = null;
        if (userProfile.weekly_schedule) {
            try {
                schedule = JSON.parse(userProfile.weekly_schedule);
            } catch (e) {
                console.error('Error parsing weekly schedule:', e);
            }
        }

        if (type === 'check_in') {
            const shiftDetails = getLogicalShiftDetails(schedule, timestamp, timezone, 'check_in');
            const logicalDate = shiftDetails.logicalDate;
            const scheduledTime = shiftDetails.scheduledTime;
            const matchedShift = shiftDetails.shift;

            // Re-entry logic: Is there already a closed attendance for this user and logical date?
            const existingAttendance = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ? ORDER BY check_in DESC LIMIT 1').get(userId, logicalDate) as any;

            if (existingAttendance) {
                if (!existingAttendance.check_out) {
                    res.status(400).json({ error: 'You already have an active session for this shift. Please check out first.' });
                    return;
                }

                // Auto-Resume existing session
                const resumeTransaction = db.transaction(() => {
                    db.prepare('UPDATE attendance SET check_out = NULL, current_status = ? WHERE id = ?').run('working', existingAttendance.id);

                    const insertInterruption = db.prepare(`
                        INSERT INTO shift_interruptions (attendance_id, start_time, end_time, type, status)
                        VALUES (?, ?, ?, 'step_away', 'pending_manager')
                    `);
                    const info = insertInterruption.run(existingAttendance.id, existingAttendance.check_out, timestamp);
                    const interruptionId = info.lastInsertRowid;

                    db.prepare(`
                        INSERT INTO requests (user_id, attendance_id, type, reference_id, reason, status)
                        VALUES (?, ?, 'shift_interruption_review', ?, 'Auto-resumed shift gap review', 'pending')
                    `).run(userId, existingAttendance.id, interruptionId);
                });

                resumeTransaction();

                const updatedRecord = db.prepare('SELECT * FROM attendance WHERE id = ?').get(existingAttendance.id);
                res.status(200).json(updatedRecord);
                return;
            }

            // Normal Check-in logic
            let status = 'on_time';
            let isUnscheduled = false;
            let otMinutes = 0;

            // Pure Schedule-Driven Logic:
            // 1. If no matchedShift or scheduledTime, it's unscheduled (no shifts in schedule).
            // 2. Otherwise, bind to the nearest upcoming shift.
            // 3. If clock-in > (scheduledTime + gracePeriod) -> late_in.
            // 4. If clock-in < (scheduledTime - gracePeriod) -> Early Entry (triggers overtime_approval).
            // 5. Otherwise -> on_time.
            
            const clockInTime = new Date(timestamp);
            const gracePeriod = userProfile.grace_period || 15;

            if (!matchedShift || !scheduledTime) {
                status = 'unscheduled';
                isUnscheduled = true;
            } else {
                const diffMinutes = (clockInTime.getTime() - scheduledTime.getTime()) / (1000 * 60);
                
                if (diffMinutes > gracePeriod) {
                    status = 'late_in';
                } else if (diffMinutes < -gracePeriod) {
                    // Early Entry: status remains 'on_time' but otMinutes > 0 triggers request
                    otMinutes = Math.floor(Math.abs(diffMinutes));
                }
            }

            const insertTransaction = db.transaction(() => {
                const insert = db.prepare(`
                    INSERT INTO attendance (user_id, check_in, date, location_lat, location_lng, status)
                    VALUES (?, ?, ?, ?, ?, ?)
                `);
                const info = insert.run(userId, timestamp, logicalDate, lat, lng, status);
                const newId = info.lastInsertRowid;

                if (isUnscheduled) {
                    db.prepare(`
                        INSERT INTO requests (user_id, type, reference_id, attendance_id, reason, details, status)
                        VALUES (?, 'overtime_approval', ?, ?, 'Unscheduled Check-in', '{}', 'pending')
                    `).run(userId, newId, newId);
                } else if (otMinutes > 0) {
                    const maxOtMinutes = (userProfile.max_overtime_hours || 0) * 60;
                    const requestedOtMinutes = maxOtMinutes > 0 ? Math.min(otMinutes, maxOtMinutes) : otMinutes;

                    db.prepare(`
                        INSERT INTO requests (user_id, type, reference_id, attendance_id, reason, details, status)
                        VALUES (?, 'overtime_approval', ?, ?, ?, ?, 'pending')
                    `).run(
                        userId,
                        newId,
                        newId,
                        `Early clock-in by ${otMinutes} minutes`,
                        JSON.stringify({ raw_overtime_minutes: otMinutes, requested_overtime_minutes: requestedOtMinutes })
                    );
                }

                return newId;
            });

            const newId = insertTransaction();
            const newRecord = db.prepare('SELECT * FROM attendance WHERE id = ?').get(newId);
            res.status(201).json(newRecord);
            return;

        } else if (type === 'check_out') {
            const activeSession = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND check_out IS NULL ORDER BY check_in DESC LIMIT 1').get(userId) as any;
            if (!activeSession) {
                res.status(400).json({ error: 'No active check-in record found to check out.' });
                return;
            }

            // Note: current_status in the DB schema is CHECK(current_status IN ('working', 'away'))
            // We'll leave it as 'working' or set it to what it was, but the primary way to tell if it's checked out is if check_out is NOT NULL.
            db.prepare(`
                UPDATE attendance 
                SET check_out = ?, location_lat = ?, location_lng = ?
                WHERE id = ?
            `).run(timestamp, lat, lng, activeSession.id);

            const updatedRecord = db.prepare('SELECT * FROM attendance WHERE id = ?').get(activeSession.id) as any;
            
            const shiftDetails = getLogicalShiftDetails(schedule, timestamp, timezone, 'check_out', activeSession.check_in);
            const scheduledTime = shiftDetails.scheduledTime;
            const matchedShift = shiftDetails.shift;

            if (!matchedShift) {
                // Was checked in unscheduled, create another overtime request for the checkout if needed, or it's handled by manager
            } else if (scheduledTime) {
                const clockOutTime = new Date(timestamp);
                const diffMinutes = (clockOutTime.getTime() - scheduledTime.getTime()) / (1000 * 60);
                const gracePeriod = userProfile.grace_period || 15;

                if (diffMinutes > gracePeriod) {
                    const otMins = Math.floor(diffMinutes);
                    const maxOtMinutes = (userProfile.max_overtime_hours || 0) * 60;
                    const requestedOtMinutes = maxOtMinutes > 0 ? Math.min(otMins, maxOtMinutes) : otMins;

                    if (requestedOtMinutes > 0) {
                        db.prepare(`
                            INSERT INTO requests (user_id, type, reference_id, attendance_id, reason, details, status)
                            VALUES (?, 'overtime_approval', ?, ?, ?, ?, 'pending')
                        `).run(
                            userId,
                            activeSession.id,
                            activeSession.id,
                            `System detected ${otMins} minutes of overtime at checkout.`,
                            JSON.stringify({ raw_overtime_minutes: otMins, requested_overtime_minutes: requestedOtMinutes })
                        );
                    }
                } else if (diffMinutes < -gracePeriod) {
                    const earlyMinutes = Math.floor(Math.abs(diffMinutes));

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
                        JSON.stringify({ early_leave_minutes: earlyMinutes, missing_minutes: earlyMinutes })
                    );
                }
            }

            res.json(updatedRecord);
        }
    } catch (error) {
        console.error('Error clocking attendance:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const syncOfflineLogs = (req: AuthRequest, res: Response): void => {
    try {
        const userId = req.user!.id;
        const { logs } = req.body;

        if (!Array.isArray(logs) || logs.length === 0) {
            res.status(400).json({ error: 'Invalid or empty logs array' });
            return;
        }

        const syncTransaction = db.transaction((logsToSync) => {
            const settingsForTz = db.prepare('SELECT timezone FROM settings WHERE id = 1').get() as any;
            const timezone = settingsForTz?.timezone || 'UTC';

            const userProfile = db.prepare(`
                SELECT p.weekly_schedule, j.grace_period
                FROM profiles p
                LEFT JOIN jobs j ON p.job_id = j.id
                WHERE p.user_id = ?
            `).get(userId) as any;

            let schedule = null;
            if (userProfile && userProfile.weekly_schedule) {
                try {
                    schedule = JSON.parse(userProfile.weekly_schedule);
                } catch (e) {
                    console.error('Error parsing weekly schedule:', e);
                }
            }

            const results = [];
            const currentServerTime = Date.now();

            const getCheckInStmt = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ? ORDER BY check_in DESC LIMIT 1');
            const getActiveSessionStmt = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND check_out IS NULL ORDER BY check_in DESC LIMIT 1');
            const insertCheckInStmt = db.prepare(`
                INSERT INTO attendance (user_id, check_in, date, location_lat, location_lng, status)
                VALUES (?, ?, ?, ?, ?, 'on_time')
            `);
            const updateCheckOutStmt = db.prepare(`
                UPDATE attendance
                SET check_out = ?, location_lat = ?, location_lng = ?
                WHERE id = ?
            `);
            const updateResumeStmt = db.prepare(`
                UPDATE attendance SET check_out = NULL, current_status = 'working' WHERE id = ?
            `);
            const insertInterruptionStmt = db.prepare(`
                INSERT INTO shift_interruptions (attendance_id, start_time, end_time, type, status)
                VALUES (?, ?, ?, 'step_away', 'pending_manager')
            `);
            const insertRequestStmt = db.prepare(`
                INSERT INTO requests (user_id, attendance_id, type, reference_id, reason, status)
                VALUES (?, ?, 'shift_interruption_review', ?, 'Auto-resumed shift gap review (Offline Sync)', 'pending')
            `);
            
            for (const log of logsToSync) {
                const { type, delay_in_milliseconds, lat, lng } = log;
                
                // Calculate true historical time securely
                const delay = typeof delay_in_milliseconds === 'number' ? delay_in_milliseconds : 0;
                const timestamp = new Date(currentServerTime - delay).toISOString();
                
                // Determine Logical Shift Date
                const shiftDetails = getLogicalShiftDetails(schedule, timestamp, timezone, type as 'check_in' | 'check_out');
                const logicalDate = shiftDetails.logicalDate;
                
                let existingRecord;
                if (type === 'check_in') {
                    existingRecord = getCheckInStmt.get(userId, logicalDate) as any;
                } else {
                    existingRecord = getActiveSessionStmt.get(userId) as any;
                }

                if (type === 'check_in') {
                    if (!existingRecord) {
                        insertCheckInStmt.run(userId, timestamp, logicalDate, lat, lng);
                        results.push({ logId: log.id, status: 'success', action: 'inserted' });
                    } else if (existingRecord.check_out) {
                        // Re-entry logic for offline sync
                        updateResumeStmt.run(existingRecord.id);
                        const info = insertInterruptionStmt.run(existingRecord.id, existingRecord.check_out, timestamp);
                        insertRequestStmt.run(userId, existingRecord.id, info.lastInsertRowid);
                        results.push({ logId: log.id, status: 'success', action: 'resumed' });
                    } else {
                        results.push({ logId: log.id, status: 'skipped', reason: 'already checked in' });
                    }
                } else if (type === 'check_out') {
                    if (existingRecord && !existingRecord.check_out) {
                        updateCheckOutStmt.run(timestamp, lat, lng, existingRecord.id);
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

export const getMyLogs = (req: AuthRequest, res: Response): void => {
    try {
        const userId = req.user!.id;
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

export const stepAway = (req: AuthRequest, res: Response): void => {
    try {
        const userId = req.user!.id;
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

export const resumeWork = (req: AuthRequest, res: Response): void => {
    try {
        const userId = req.user!.id;
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
