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
        const { type, timestamp, lat, lng } = req.body;

        if (!type || !['check_in', 'check_out'].includes(type) || !timestamp || lat === undefined || lng === undefined) {
            res.status(400).json({ error: 'Missing required fields' });
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

        // Check if a record exists for today
        const existingRecord = db.prepare('SELECT * FROM attendance WHERE user_id = ? AND date = ?').get(userId, date) as any;

        if (type === 'check_in') {
            if (existingRecord) {
                res.status(400).json({ error: 'Already checked in for today' });
                return;
            }

            // Insert new check-in record
            const insert = db.prepare(`
                INSERT INTO attendance (user_id, check_in, date, location_lat, location_lng, status)
                VALUES (?, ?, ?, ?, ?, 'present')
            `);
            
            const info = insert.run(userId, timestamp, date, lat, lng);
            const newRecord = db.prepare('SELECT * FROM attendance WHERE id = ?').get(info.lastInsertRowid);
            
            res.status(201).json(newRecord);
        } else if (type === 'check_out') {
            if (!existingRecord) {
                res.status(400).json({ error: 'No check-in record found for today' });
                return;
            }

            if (existingRecord.check_out) {
                res.status(400).json({ error: 'Already checked out for today' });
                return;
            }

            // Update check-out record
            db.prepare(`
                UPDATE attendance 
                SET check_out = ?, location_lat = ?, location_lng = ?
                WHERE id = ?
            `).run(timestamp, lat, lng, existingRecord.id);

            const updatedRecord = db.prepare('SELECT * FROM attendance WHERE id = ?').get(existingRecord.id);
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
