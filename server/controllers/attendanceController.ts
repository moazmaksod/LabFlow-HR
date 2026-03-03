import { Request, Response } from 'express';
import db from '../db/index.js';

export const clockAttendance = (req: Request, res: Response): void => {
    try {
        const userId = (req as any).user.id;
        const { type, timestamp, lat, lng } = req.body;

        if (!type || !['check_in', 'check_out'].includes(type) || !timestamp || lat === undefined || lng === undefined) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
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
