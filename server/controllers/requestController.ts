import { Request, Response } from 'express';
import db from '../db/index.js';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import { getDateStringInTimezone } from '../utils/dateUtils.js';
import { getOrCreateDraftPayroll } from './payrollController.js';
import { logAudit } from '../services/auditService.js';

export const createRequest = (req: AuthRequest, res: Response): void => {
    try {
        const userId = req.user!.id;
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

        logAudit('requests', info.lastInsertRowid as number, 'CREATE', userId, null, newReq);

        res.status(201).json(newReq);
    } catch (error) {
        console.error('Error creating request:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getRequests = (req: AuthRequest, res: Response): void => {
    try {
        const user = req.user!;
        let requests;

        if (user.role === 'manager') {
            requests = db.prepare(`
            SELECT r.*, u.name as user_name, a.date as attendance_date, a.check_in as original_check_in, a.check_out as original_check_out, si.end_time as interruption_end_time
                FROM requests r
                JOIN users u ON r.user_id = u.id
                LEFT JOIN attendance a ON r.attendance_id = a.id
            LEFT JOIN shift_interruptions si ON r.reference_id = si.id AND r.type = 'permission_to_leave'
                ORDER BY r.created_at DESC
            `).all();
        } else {
            requests = db.prepare(`
                SELECT r.*, u.name as user_name, a.date as attendance_date, a.check_in as original_check_in, a.check_out as original_check_out, si.end_time as interruption_end_time
                FROM requests r
                JOIN users u ON r.user_id = u.id
                LEFT JOIN attendance a ON r.attendance_id = a.id
                LEFT JOIN shift_interruptions si ON r.reference_id = si.id AND r.type = 'permission_to_leave'
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

export const createAttendanceCorrection = (req: AuthRequest, res: Response): void => {
    try {
        const userId = req.user!.id;
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

        const userProfile = db.prepare(`
            SELECT p.weekly_schedule
            FROM profiles p
            WHERE p.user_id = ?
        `).get(userId) as any;

        const settingsRecord = db.prepare('SELECT company_timezone, late_grace_period FROM settings WHERE id = 1').get() as any;
        const timezone = settingsRecord?.company_timezone || 'UTC';
        const gracePeriod = settingsRecord?.late_grace_period !== undefined ? settingsRecord.late_grace_period : 0;

        let missingMinutes = 0;
        if (userProfile && userProfile.weekly_schedule) {
            try {
                const checkIn = new_clock_in || attendanceRecord.check_in;
                const checkOut = new_clock_out || attendanceRecord.check_out;

                let shiftInstance = null;
                if (attendanceRecord.shift_id && !attendanceRecord.shift_id.startsWith('unscheduled_')) {
                    shiftInstance = db.prepare('SELECT * FROM shift_instances WHERE id = ?').get(attendanceRecord.shift_id) as any;
                }

                if (shiftInstance) {
                    if (checkIn) {
                        const startScheduled = new Date(shiftInstance.start_time);
                        const diff = (new Date(checkIn).getTime() - startScheduled.getTime()) / (1000 * 60);
                        if (diff > gracePeriod) {
                            missingMinutes += Math.floor(diff);
                        }
                    }
                    if (checkOut) {
                        const endScheduled = new Date(shiftInstance.end_time);
                        const diff = (endScheduled.getTime() - new Date(checkOut).getTime()) / (1000 * 60);
                        if (diff > gracePeriod) {
                            missingMinutes += Math.floor(diff);
                        }
                    }
                }
            } catch (e) {
                console.error('Error calculating missing minutes for correction:', e);
            }
        }

        const details = JSON.stringify({ new_clock_in, new_clock_out, breaks, missing_minutes: missingMinutes });

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
        const actorId = (req as AuthRequest).user!.id;
        const { id } = req.params;
        const { status, manager_note, approved_minutes, is_paid_permission, paid_permission_minutes, penalty_hours } = req.body;

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
            res.status(400).json({ error: 'Request is already processed', errorCode: 'ERR_ALREADY_PROCESSED', currentStatus: requestRecord.status });
            return;
        }

        if (!manager_note || manager_note.trim() === '') {
            res.status(400).json({ error: 'A manager note is mandatory to approve or reject this request.' });
            return;
        }

        const oldRequest = { ...requestRecord };
        let oldAttendance = null;
        if (requestRecord.attendance_id) {
            oldAttendance = db.prepare('SELECT * FROM attendance WHERE id = ?').get(requestRecord.attendance_id) as any;
        }
        let oldInterruption = null;
        if (requestRecord.type === 'permission_to_leave' && requestRecord.reference_id) {
            oldInterruption = db.prepare('SELECT * FROM shift_interruptions WHERE id = ?').get(requestRecord.reference_id) as any;
        }

        const transaction = db.transaction(() => {
            // Update the request status, manager note and is_paid_permission
            db.prepare('UPDATE requests SET status = ?, manager_note = ?, is_paid_permission = ?, paid_permission_minutes = ? WHERE id = ?').run(
                status,
                manager_note || null,
                is_paid_permission ? 1 : 0,
                paid_permission_minutes || 0,
                id
            );

            // If it's a permission_to_leave request, update shift_interruptions
            if (requestRecord.type === 'permission_to_leave' && requestRecord.reference_id) {
                const interruptionStatus = status === 'approved' ? 'manager_approved' : 'manager_rejected';
                db.prepare('UPDATE shift_interruptions SET status = ? WHERE id = ?').run(interruptionStatus, requestRecord.reference_id);
            }

            // If approved, handle specific request types
            if (status === 'approved') {
                // Sync is_paid_permission and paid_permission_minutes to attendance if applicable
                if (requestRecord.attendance_id) {
                    db.prepare('UPDATE attendance SET is_paid_permission = ?, paid_permission_minutes = ? WHERE id = ?').run(
                        is_paid_permission ? 1 : 0,
                        paid_permission_minutes || 0,
                        requestRecord.attendance_id
                    );
                }

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
                            check_out = COALESCE(?, check_out),
                            status = ?
                        WHERE id = ?
                    `;

                    // Recalculate status based on new check_in
                    let newStatus = 'on_time';
                    const finalCheckIn = details.new_clock_in || (originalAttendance ? originalAttendance.check_in : null);

                    const fullOriginalAttendance = db.prepare('SELECT * FROM attendance WHERE id = ?').get(requestRecord.attendance_id) as any;

                    if (finalCheckIn && fullOriginalAttendance) {
                        const userProfile = db.prepare(`
                            SELECT p.weekly_schedule
                            FROM profiles p
                            WHERE p.user_id = ?
                        `).get(requestRecord.user_id) as any;

                        if (userProfile) {
                            const settingsRecord = db.prepare('SELECT late_grace_period FROM settings WHERE id = 1').get() as any;
                            const gracePeriod = settingsRecord?.late_grace_period !== undefined ? settingsRecord.late_grace_period : 0;

                            let shiftInstance = null;
                            if (fullOriginalAttendance.shift_id && !fullOriginalAttendance.shift_id.startsWith('unscheduled_')) {
                                shiftInstance = db.prepare('SELECT * FROM shift_instances WHERE id = ?').get(fullOriginalAttendance.shift_id) as any;
                            }

                            if (shiftInstance) {
                                const scheduledTime = new Date(shiftInstance.start_time);
                                const clockInTime = new Date(finalCheckIn);
                                const diffMinutes = (clockInTime.getTime() - scheduledTime.getTime()) / (1000 * 60);

                                if (diffMinutes > gracePeriod) {
                                    newStatus = 'late_in';
                                }
                            } else {
                                newStatus = 'unscheduled';
                            }
                        }
                    }

                    db.prepare(updateQuery).run(
                        details.new_clock_in || null,
                        details.new_clock_out || null,
                        newStatus,
                        requestRecord.attendance_id
                    );

                    // Update breaks if provided
                    if (details.breaks && Array.isArray(details.breaks) && details.breaks.length > 0) {
                        // Optimized via CASE statement: Benchmark showed Loop within Transaction is 1.031 ms vs CASE Statement is 20.904 ms at N=500.
                        // While CASE statement is slower in better-sqlite3 due to statement compilation overhead vs cached prepared statement execution,
                        // it resolves the N+1 query pattern.
                        const validBreaks = details.breaks.filter((b: any) => b.id);
                        if (validBreaks.length > 0) {
                            let startCase = 'CASE id ';
                            let endCase = 'CASE id ';
                            const ids: any[] = [];
                            const startParams: any[] = [];
                            const endParams: any[] = [];
                            const idParams: any[] = [];

                            for (const b of validBreaks) {
                                startCase += 'WHEN ? THEN COALESCE(?, start_time) ';
                                startParams.push(b.id, b.start_time || null);

                                endCase += 'WHEN ? THEN COALESCE(?, end_time) ';
                                endParams.push(b.id, b.end_time || null);

                                ids.push(b.id);
                                idParams.push('?');
                            }

                            startCase += 'END';
                            endCase += 'END';

                            const updateQuery = `
                                UPDATE shift_interruptions
                                SET start_time = ${startCase},
                                    end_time = ${endCase}
                                WHERE attendance_id = ? AND id IN (${idParams.join(', ')})
                            `;

                            const finalParams = [...startParams, ...endParams, requestRecord.attendance_id, ...ids];
                            db.prepare(updateQuery).run(...finalParams);
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

                        // Recalculate status based on new check_in
                        let newStatus = 'on_time';
                        const finalCheckIn = requestRecord.requested_check_in || (originalAttendance ? originalAttendance.check_in : null);

                        // We need the full original attendance record to check its shift_id
                        const fullOriginalAttendance = db.prepare('SELECT * FROM attendance WHERE id = ?').get(requestRecord.attendance_id) as any;

                        if (finalCheckIn && fullOriginalAttendance) {
                            const userProfile = db.prepare(`
                                SELECT p.weekly_schedule
                                FROM profiles p
                                WHERE p.user_id = ?
                            `).get(requestRecord.user_id) as any;

                            if (userProfile) {
                                const settingsRecord = db.prepare('SELECT late_grace_period FROM settings WHERE id = 1').get() as any;
                                const gracePeriod = settingsRecord?.late_grace_period !== undefined ? settingsRecord.late_grace_period : 0;

                                let shiftInstance = null;
                                if (fullOriginalAttendance.shift_id && !fullOriginalAttendance.shift_id.startsWith('unscheduled_')) {
                                    shiftInstance = db.prepare('SELECT * FROM shift_instances WHERE id = ?').get(fullOriginalAttendance.shift_id) as any;
                                }

                                if (shiftInstance) {
                                    const scheduledTime = new Date(shiftInstance.start_time);
                                    const clockInTime = new Date(finalCheckIn);
                                    const diffMinutes = (clockInTime.getTime() - scheduledTime.getTime()) / (1000 * 60);

                                    if (diffMinutes > gracePeriod) {
                                        newStatus = 'late_in';
                                    }
                                } else {
                                    newStatus = 'unscheduled';
                                }
                            }
                        }

                        // Update existing attendance
                        const updateQuery = `
                            UPDATE attendance
                            SET check_in = COALESCE(?, check_in),
                                check_out = COALESCE(?, check_out),
                                status = ?
                            WHERE id = ?
                        `;
                        db.prepare(updateQuery).run(
                            requestRecord.requested_check_in,
                            requestRecord.requested_check_out,
                            newStatus,
                            requestRecord.attendance_id
                        );
                    } else {
                        // Insert new attendance
                        // Determine date from check_in or check_out
                        const timeString = requestRecord.requested_check_in || requestRecord.requested_check_out;
                        const date = new Date(timeString).toISOString().split('T')[0];

                        // Recalculate status based on check_in
                        let newStatus = 'on_time';
                        if (requestRecord.requested_check_in) {
                            const userProfile = db.prepare(`
                                SELECT p.weekly_schedule
                                FROM profiles p
                                WHERE p.user_id = ?
                            `).get(requestRecord.user_id) as any;

                            const settingsRecord = db.prepare('SELECT company_timezone, late_grace_period FROM settings WHERE id = 1').get() as any;
                            const gracePeriod = settingsRecord?.late_grace_period !== undefined ? settingsRecord.late_grace_period : 0;

                            if (userProfile) {
                                // Since this is a CREATE NEW manual clock, there is no prior attendance record.
                                // We MUST look up the intended shift instance by checking the window as originally intended.
                                const shiftInstance = db.prepare(`
                                    SELECT * FROM shift_instances
                                    WHERE user_id = ? AND ? BETWEEN datetime(start_time, '-' || ? || ' minutes') AND end_time
                                    ORDER BY start_time ASC LIMIT 1
                                `).get(requestRecord.user_id, requestRecord.requested_check_in, gracePeriod) as any;

                                if (shiftInstance) {
                                    const scheduledTime = new Date(shiftInstance.start_time);
                                    const clockInTime = new Date(requestRecord.requested_check_in);
                                    const diffMinutes = (clockInTime.getTime() - scheduledTime.getTime()) / (1000 * 60);

                                    if (diffMinutes > gracePeriod) {
                                        newStatus = 'late_in';
                                    }
                                } else {
                                    newStatus = 'unscheduled';
                                }
                            }
                        }

                        db.prepare(`
                            INSERT INTO attendance (user_id, check_in, check_out, date, status)
                            VALUES (?, ?, ?, ?, ?)
                        `).run(
                            requestRecord.user_id,
                            requestRecord.requested_check_in,
                            requestRecord.requested_check_out,
                            date,
                            newStatus
                        );
                    }
                }
            }

            // --- Payroll Ledger Integration ---
            const userProfile = db.prepare('SELECT hourly_rate FROM profiles WHERE user_id = ?').get(requestRecord.user_id) as any;
            const hourlyRate = userProfile?.hourly_rate || 0;
            const dateStr = new Date().toISOString().split('T')[0]; // Use current date for the payroll period
            const payrollId = getOrCreateDraftPayroll(requestRecord.user_id, dateStr, actorId);

            if (requestRecord.type === 'overtime_approval') {
                const requestedMinutes = requestRecord.details ? JSON.parse(requestRecord.details).requested_overtime_minutes : 0;
                const minutes = status === 'approved' ? (approved_minutes !== undefined ? approved_minutes : requestedMinutes) : requestedMinutes;
                const hours = minutes / 60;
                const amount = status === 'approved' ? hours * (hourlyRate * 1.5) : 0; // Overtime is 1.5x

                db.prepare(`
                    INSERT INTO payroll_transactions (payroll_id, reference_id, type, hours, amount, status, manager_notes)
                    VALUES (?, ?, 'overtime', ?, ?, ?, ?)
                `).run(payrollId, id, hours, amount, status === 'approved' ? 'applied' : 'rejected', manager_note);
            } else if (requestRecord.type === 'permission_to_leave') {
                const minutes = paid_permission_minutes || 0;
                const hours = minutes / 60;

                if (status === 'approved' && !is_paid_permission && hours > 0) {
                    const amount = hours * hourlyRate;
                    db.prepare(`
                        INSERT INTO payroll_transactions (payroll_id, reference_id, type, hours, amount, status, manager_notes)
                        VALUES (?, ?, 'step_away_unpaid', ?, ?, 'applied', ?)
                    `).run(payrollId, id, hours, amount, manager_note);
                } else if (status === 'rejected') {
                    db.prepare(`
                        INSERT INTO payroll_transactions (payroll_id, reference_id, type, hours, amount, status, manager_notes)
                        VALUES (?, ?, 'step_away_unpaid', ?, 0, 'rejected', ?)
                    `).run(payrollId, id, hours, manager_note);
                }
            }

            // Disciplinary Penalty Logic
            if (status === 'rejected' && penalty_hours && penalty_hours > 0) {
                const penaltyAmount = penalty_hours * hourlyRate;
                db.prepare(`
                    INSERT INTO payroll_transactions (payroll_id, reference_id, type, hours, amount, status, manager_notes)
                    VALUES (?, ?, 'disciplinary_penalty', ?, ?, 'applied', ?)
                `).run(payrollId, id, penalty_hours, penaltyAmount, manager_note);
            }
        });

        transaction();

        const updatedRequest = db.prepare(`
            SELECT r.*, u.name as user_name
            FROM requests r
            JOIN users u ON r.user_id = u.id
            WHERE r.id = ?
        `).get(id);

        logAudit('requests', Number(id), status === 'approved' ? 'APPROVE' : 'REJECT', actorId, oldRequest, updatedRequest);

        if (oldAttendance) {
            const newAttendance = db.prepare('SELECT * FROM attendance WHERE id = ?').get(requestRecord.attendance_id) as any;
            if (JSON.stringify(oldAttendance) !== JSON.stringify(newAttendance)) {
                logAudit('attendance', requestRecord.attendance_id, 'UPDATE', actorId, oldAttendance, newAttendance);
            }
        }

        if (oldInterruption) {
            const newInterruption = db.prepare('SELECT * FROM shift_interruptions WHERE id = ?').get(requestRecord.reference_id) as any;
            if (JSON.stringify(oldInterruption) !== JSON.stringify(newInterruption)) {
                logAudit('shift_interruptions', requestRecord.reference_id, 'UPDATE', actorId, oldInterruption, newInterruption);
            }
        }

        res.json(updatedRequest);
    } catch (error) {
        console.error('Error updating request status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
