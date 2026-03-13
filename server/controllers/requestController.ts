import { Request, Response } from 'express';
import db from '../db/index.js';

export const createRequest = (req: Request, res: Response): void => {
    try {
        const userId = (req as any).user.id;
        const { reason, requested_check_in, requested_check_out, attendance_id, type } = req.body;

        if (!reason) {
            res.status(400).json({ error: 'Reason is required' });
            return;
        }

        const requestType = type || 'manual_clock';

        if (attendance_id) {
            const existingPending = db.prepare(`
                SELECT id FROM requests 
                WHERE user_id = ? AND attendance_id = ? AND status = 'pending' AND type = ?
            `).get(userId, attendance_id, requestType);
            
            if (existingPending) {
                res.status(400).json({ error: 'A pending request of this type already exists for this attendance record.' });
                return;
            }
        }

        const insert = db.prepare(`
            INSERT INTO requests (user_id, attendance_id, requested_check_in, requested_check_out, type, reason, status)
            VALUES (?, ?, ?, ?, ?, ?, 'pending')
        `);
        
        const info = insert.run(userId, attendance_id || null, requested_check_in || null, requested_check_out || null, requestType, reason);
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
        const { attendance_id, new_clock_in, new_clock_out, reason, breaks } = req.body;

        if (!attendance_id || !reason || (!new_clock_in && !new_clock_out && !breaks)) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        const attendanceRecord = db.prepare('SELECT check_out FROM attendance WHERE id = ? AND user_id = ?').get(attendance_id, userId) as any;
        if (!attendanceRecord) {
            res.status(404).json({ error: 'Attendance record not found' });
            return;
        }

        if (!attendanceRecord.check_out) {
            res.status(400).json({ error: 'Cannot correct an active shift. Please check out first.' });
            return;
        }

        const existingCorrection = db.prepare(`
            SELECT id FROM requests 
            WHERE user_id = ? AND attendance_id = ? AND type = 'attendance_correction'
        `).get(userId, attendance_id);
        
        if (existingCorrection) {
            res.status(400).json({ error: 'An attendance correction request has already been submitted for this record. Only one correction is allowed per shift.' });
            return;
        }

        const details = JSON.stringify({ new_clock_in, new_clock_out, breaks });
        
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

        if (status === 'rejected' && (!manager_note || manager_note.trim() === '')) {
            res.status(400).json({ error: 'A manager note is required when rejecting a request.' });
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
                    
                    // Fetch original attendance to save it in the request details for auditing
                    const originalAttendance = db.prepare('SELECT check_in, check_out FROM attendance WHERE id = ?').get(requestRecord.attendance_id) as any;
                    if (originalAttendance) {
                        const updatedDetails = {
                            ...details,
                            original_check_in: originalAttendance.check_in,
                            original_check_out: originalAttendance.check_out
                        };
                        db.prepare('UPDATE requests SET details = ? WHERE id = ?').run(JSON.stringify(updatedDetails), id);
                    }

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

                    // Update breaks if provided
                    if (details.breaks && Array.isArray(details.breaks)) {
                        for (const b of details.breaks) {
                            if (b.id) {
                                db.prepare(`
                                    UPDATE shift_interruptions 
                                    SET start_time = COALESCE(?, start_time), 
                                        end_time = COALESCE(?, end_time)
                                    WHERE id = ? AND attendance_id = ?
                                `).run(b.start_time || null, b.end_time || null, b.id, requestRecord.attendance_id);
                            }
                        }
                    }
                } else if (requestRecord.type === 'early_leave_approval' && requestRecord.attendance_id) {
                    db.prepare("UPDATE attendance SET status = 'on_time' WHERE id = ? AND status = 'early_out'").run(requestRecord.attendance_id);
                } else if (requestRecord.type === 'manual_clock' && (requestRecord.requested_check_in || requestRecord.requested_check_out)) {
                    if (requestRecord.attendance_id) {
                        // Fetch original attendance to save it in the request details for auditing
                        const originalAttendance = db.prepare('SELECT check_in, check_out FROM attendance WHERE id = ?').get(requestRecord.attendance_id) as any;
                        if (originalAttendance) {
                            const details = requestRecord.details ? JSON.parse(requestRecord.details) : {};
                            const updatedDetails = {
                                ...details,
                                original_check_in: originalAttendance.check_in,
                                original_check_out: originalAttendance.check_out
                            };
                            db.prepare('UPDATE requests SET details = ? WHERE id = ?').run(JSON.stringify(updatedDetails), id);
                        }

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
                            VALUES (?, ?, ?, ?, 'on_time')
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
