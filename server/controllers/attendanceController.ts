import { Request, Response } from 'express';
import db from '../db/index.js';

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
        const { type, timestamp, lat, lng, deviceId } = req.body;

        if (!type || !['check_in', 'check_out'].includes(type) || !timestamp || lat === undefined || lng === undefined || !deviceId) {
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

        // Extract date from timestamp (YYYY-MM-DD)
        const date = new Date(timestamp).toISOString().split('T')[0];

        // Check if there is an active session (not checked out)
        const activeSession = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ? AND check_out IS NULL').get(userId, date) as any;

        if (type === 'check_in') {
            if (activeSession) {
                res.status(400).json({ error: 'You already have an active session for today. Please check out first.' });
                return;
            }

            // Determine status (present or late) based on weekly_schedule
            let status = 'present';
            const userProfile = db.prepare(`
                SELECT p.weekly_schedule, j.grace_period
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

                    if (todaySchedule && !todaySchedule.isOff && todaySchedule.start) {
                        const [schedHours, schedMinutes] = todaySchedule.start.split(':').map(Number);
                        const clockInTime = new Date(timestamp);
                        const scheduledTime = new Date(timestamp);
                        scheduledTime.setHours(schedHours, schedMinutes, 0, 0);

                        const diffMinutes = (clockInTime.getTime() - scheduledTime.getTime()) / (1000 * 60);
                        const gracePeriod = userProfile.grace_period || 15;

                        if (diffMinutes > gracePeriod) {
                            status = 'late';
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

            const updatedRecord = db.prepare('SELECT * FROM attendance WHERE id = ?').get(activeSession.id);
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
            const results = [];
            for (const log of logsToSync) {
                const { type, timestamp, lat, lng } = log;
                const date = new Date(timestamp).toISOString().split('T')[0];
                const existingRecord = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(userId, date) as any;

                if (type === 'check_in') {
                    if (!existingRecord) {
                        const info = db.prepare(`
                            INSERT INTO attendance (user_id, check_in, date, location_lat, location_lng, status)
                            VALUES (?, ?, ?, ?, ?, 'present')
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
        `).all(userId);
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
        `).all();
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

        const todayStats = db.prepare(`
            SELECT 
                SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present,
                SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as late,
                SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent
            FROM attendance
            WHERE date = date('now', 'localtime')
        `).get() as any;

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
        const { timestamp, deviceId } = req.body;

        if (!timestamp || !deviceId) {
            res.status(400).json({ error: 'Missing timestamp or deviceId' });
            return;
        }

        // Device Binding Security Check
        const profile = db.prepare('SELECT device_id FROM profiles WHERE user_id = ?').get(userId) as any;
        if (!profile.device_id || profile.device_id !== deviceId) {
            res.status(403).json({ error: 'Security Alert: Unauthorized device.' });
            return;
        }

        const date = new Date(timestamp).toISOString().split('T')[0];
        const activeAttendance = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ? AND check_out IS NULL').get(userId, date) as any;

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
        const { timestamp, deviceId } = req.body;

        if (!timestamp || !deviceId) {
            res.status(400).json({ error: 'Missing timestamp or deviceId' });
            return;
        }

        // Device Binding Security Check
        const profile = db.prepare('SELECT device_id FROM profiles WHERE user_id = ?').get(userId) as any;
        if (!profile.device_id || profile.device_id !== deviceId) {
            res.status(403).json({ error: 'Security Alert: Unauthorized device.' });
            return;
        }

        const date = new Date(timestamp).toISOString().split('T')[0];
        const activeAttendance = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ? AND check_out IS NULL').get(userId, date) as any;

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
