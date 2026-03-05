import { Request, Response } from 'express';
import db from '../db/index.js';

export const createRequest = (req: Request, res: Response): void => {
    try {
        const userId = (req as any).user.id;
        const { reason, requested_check_in, requested_check_out, attendance_id } = req.body;

        if (!reason) {
            res.status(400).json({ error: 'Reason is required' });
            return;
        }

        const insert = db.prepare(`
            INSERT INTO requests (user_id, attendance_id, requested_check_in, requested_check_out, reason, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
        `);
        
        const info = insert.run(userId, attendance_id || null, requested_check_in || null, requested_check_out || null, reason);
        const newReq = db.prepare('SELECT * FROM requests WHERE id = ?').get(info.lastInsertRowid);
        
        res.status(201).json(newReq);
    } catch (error) {
        console.error('Error creating request:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getRequests = (req: Request, res: Response): void => {
    try {
        const user = (req as any).user;
        let requests;

        if (user.role === 'manager') {
            requests = db.prepare(`
                SELECT r.*, u.name as user_name, a.date as attendance_date
                FROM requests r
                JOIN users u ON r.user_id = u.id
                LEFT JOIN attendance a ON r.attendance_id = a.id
                ORDER BY r.created_at DESC
            `).all();
        } else {
            requests = db.prepare(`
                SELECT r.*, u.name as user_name, a.date as attendance_date
                FROM requests r
                JOIN users u ON r.user_id = u.id
                LEFT JOIN attendance a ON r.attendance_id = a.id
                WHERE r.user_id = ?
                ORDER BY r.created_at DESC
            `).all(user.id);
        }

        res.json(requests);
    } catch (error) {
        console.error('Error fetching requests:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateRequestStatus = (req: Request, res: Response): void => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['approved', 'rejected'].includes(status)) {
            res.status(400).json({ error: 'Invalid status' });
            return;
        }

        const requestRecord = db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as any;
        if (!requestRecord) {
            res.status(404).json({ error: 'Request not found' });
            return;
        }

        if (requestRecord.status !== 'pending') {
            res.status(400).json({ error: 'Request is already processed' });
            return;
        }

        const transaction = db.transaction(() => {
            // Update the request status
            db.prepare('UPDATE requests SET status = ? WHERE id = ?').run(status, id);

            // If it's a permission_to_leave request, update shift_interruptions
            if (requestRecord.type === 'permission_to_leave' && requestRecord.reference_id) {
                const interruptionStatus = status === 'approved' ? 'manager_approved' : 'manager_rejected';
                db.prepare('UPDATE shift_interruptions SET status = ? WHERE id = ?').run(interruptionStatus, requestRecord.reference_id);
            }

            // If approved and has requested times, update/insert attendance
            if (status === 'approved' && (requestRecord.requested_check_in || requestRecord.requested_check_out)) {
                if (requestRecord.attendance_id) {
                    // Update existing attendance
                    const updateQuery = `
                        UPDATE attendance 
                        SET check_in = COALESCE(?, check_in), 
                            check_out = COALESCE(?, check_out)
                        WHERE id = ?
                    `;
                    db.prepare(updateQuery).run(
                        requestRecord.requested_check_in, 
                        requestRecord.requested_check_out, 
                        requestRecord.attendance_id
                    );
                } else {
                    // Insert new attendance
                    // Determine date from check_in or check_out
                    const timeString = requestRecord.requested_check_in || requestRecord.requested_check_out;
                    const date = new Date(timeString).toISOString().split('T')[0];
                    
                    db.prepare(`
                        INSERT INTO attendance (user_id, check_in, check_out, date, status)
                        VALUES (?, ?, ?, ?, 'present')
                    `).run(
                        requestRecord.user_id, 
                        requestRecord.requested_check_in, 
                        requestRecord.requested_check_out, 
                        date
                    );
                }
            }
        });

        transaction();

        const updatedRequest = db.prepare(`
            SELECT r.*, u.name as user_name 
            FROM requests r 
            JOIN users u ON r.user_id = u.id 
            WHERE r.id = ?
        `).get(id);
        
        res.json(updatedRequest);
    } catch (error) {
        console.error('Error updating request status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
