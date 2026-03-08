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
                SELECT r.*, u.name as user_name, a.date as attendance_date, a.check_in as original_check_in, a.check_out as original_check_out
                FROM requests r
                JOIN users u ON r.user_id = u.id
                LEFT JOIN attendance a ON r.attendance_id = a.id
                ORDER BY r.created_at DESC
            `).all();
        } else {
            requests = db.prepare(`
                SELECT r.*, u.name as user_name, a.date as attendance_date, a.check_in as original_check_in, a.check_out as original_check_out
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

export const createAttendanceCorrection = (req: Request, res: Response): void => {
    try {
        const userId = (req as any).user.id;
        const { attendance_id, new_clock_in, new_clock_out, reason } = req.body;

        if (!attendance_id || !reason || (!new_clock_in && !new_clock_out)) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        const details = JSON.stringify({ new_clock_in, new_clock_out });
        
        const insert = db.prepare(`
            INSERT INTO requests (user_id, attendance_id, type, details, reason, status)
            VALUES (?, ?, 'attendance_correction', ?, ?, 'pending')
        `);
        
        const info = insert.run(userId, attendance_id, details, reason);
        const newReq = db.prepare('SELECT * FROM requests WHERE id = ?').get(info.lastInsertRowid);
        
        res.status(201).json(newReq);
    } catch (error) {
        console.error('Error creating attendance correction request:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateRequestStatus = (req: Request, res: Response): void => {
    try {
        const { id } = req.params;
        const { status, manager_note, approved_minutes } = req.body;

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
            // Update the request status and manager note
            db.prepare('UPDATE requests SET status = ?, manager_note = ? WHERE id = ?').run(status, manager_note || null, id);

            // If it's a permission_to_leave request, update shift_interruptions
            if (requestRecord.type === 'permission_to_leave' && requestRecord.reference_id) {
                const interruptionStatus = status === 'approved' ? 'manager_approved' : 'manager_rejected';
                db.prepare('UPDATE shift_interruptions SET status = ? WHERE id = ?').run(interruptionStatus, requestRecord.reference_id);
            }

            // If approved, handle specific request types
            if (status === 'approved') {
                if (requestRecord.type === 'overtime_approval' && requestRecord.attendance_id) {
                    // Update approved overtime minutes
                    const minutesToApprove = approved_minutes !== undefined ? approved_minutes : 
                        (requestRecord.details ? JSON.parse(requestRecord.details).requested_overtime_minutes : 0);
                    
                    db.prepare('UPDATE attendance SET approved_overtime_minutes = ? WHERE id = ?').run(
                        minutesToApprove,
                        requestRecord.attendance_id
                    );
                } else if (requestRecord.type === 'attendance_correction' && requestRecord.details) {
                    const details = JSON.parse(requestRecord.details);
                    const updateQuery = `
                        UPDATE attendance 
                        SET check_in = COALESCE(?, check_in), 
                            check_out = COALESCE(?, check_out)
                        WHERE id = ?
                    `;
                    db.prepare(updateQuery).run(
                        details.new_clock_in || null, 
                        details.new_clock_out || null, 
                        requestRecord.attendance_id
                    );
                } else if (requestRecord.requested_check_in || requestRecord.requested_check_out) {
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
