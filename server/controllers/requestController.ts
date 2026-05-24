import { Request, Response } from 'express';
import db from '../db/index.js';
import { AuthRequest } from '../middlewares/authMiddleware.js';

import { getOrCreateDraftPayroll } from './payrollController.js';
import { logAudit } from '../services/auditService.js';
import logger from '../utils/logger.js';
import { evaluateUserAttendance } from '../services/attendanceEvaluationService.js';
import { getDifferenceInMinutes } from '../utils/timeManager.js';

export const createRequest = (req: AuthRequest, res: Response): void => {
    try {
        const userId = req.user!.id;
        const { reason, requested_check_in, requested_check_out, attendance_id, type, value } = req.body;

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
            INSERT INTO requests (user_id, attendance_id, requested_check_in, requested_check_out, type, reason, value, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
        `);

        const info = insert.run(userId, attendance_id || null, requested_check_in || null, requested_check_out || null, requestType, reason, value || 0);
        const newReq = db.prepare('SELECT * FROM requests WHERE id = ?').get(info.lastInsertRowid);

        logAudit('requests', info.lastInsertRowid as number, 'CREATE', userId, null, newReq);

        res.status(201).json(newReq);
    } catch (error) {
        logger.error('Error creating request:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getRequests = (req: AuthRequest, res: Response): void => {
    try {
        const user = req.user!;
        let requests;

        if (user.role === 'manager') {
            // JIT evaluate attendance for all users to ensure early leave requests are up-to-date
            const allUsers = db.prepare('SELECT id FROM users').all() as any[];
            allUsers.forEach(u => {
                try {
                    evaluateUserAttendance(u.id);
                } catch (e) {
                    logger.error(`Error JIT evaluating attendance for user ${u.id}:`, e);
                }
            });

            requests = db.prepare(`
                SELECT r.*, u.name as user_name, a.date as attendance_date, a.check_in as original_check_in, a.check_out as original_check_out, 
                       a.shift_id as attendance_shift_id,
                       (SELECT COALESCE(SUM(r2.paid_minutes), 0) FROM requests r2 WHERE r2.attendance_id = a.id AND r2.status = 'approved' AND r2.type = 'overtime_approval') as approved_overtime_minutes,
                       si.start_time as interruption_start_time, si.end_time as interruption_end_time,
                       s.id as shift_instance_id, s.start_time as shift_start_time, s.end_time as shift_end_time, s.logical_date as shift_logical_date
                FROM requests r
                JOIN users u ON r.user_id = u.id
                LEFT JOIN attendance a ON r.attendance_id = a.id
                LEFT JOIN shift_instances s ON (
                    (a.shift_id IS NOT NULL AND a.shift_id = s.id AND a.shift_id NOT LIKE 'US_%')
                    OR
                    (
                        (a.shift_id IS NULL OR a.shift_id LIKE 'US_%') 
                        AND s.id = (
                            SELECT id FROM shift_instances 
                            WHERE user_id = r.user_id 
                              AND logical_date = COALESCE(
                                  a.date, 
                                  substr(r.requested_check_in, 1, 10), 
                                  substr(r.created_at, 1, 10)
                              )
                              AND status != 'Cancelled'
                            LIMIT 1
                        )
                    )
                )
                LEFT JOIN shift_interruptions si ON r.shift_interruption_id = si.id AND r.type IN ('permission_to_leave', 'shift_interruption_review')
                ORDER BY r.created_at DESC
            `).all();
        } else {
            requests = db.prepare(`
                SELECT r.*, u.name as user_name, a.date as attendance_date, a.check_in as original_check_in, a.check_out as original_check_out, 
                       a.shift_id as attendance_shift_id,
                       (SELECT COALESCE(SUM(r2.paid_minutes), 0) FROM requests r2 WHERE r2.attendance_id = a.id AND r2.status = 'approved' AND r2.type = 'overtime_approval') as approved_overtime_minutes,
                       si.start_time as interruption_start_time, si.end_time as interruption_end_time,
                       s.id as shift_instance_id, s.start_time as shift_start_time, s.end_time as shift_end_time, s.logical_date as shift_logical_date
                FROM requests r
                JOIN users u ON r.user_id = u.id
                LEFT JOIN attendance a ON r.attendance_id = a.id
                LEFT JOIN shift_instances s ON (
                    (a.shift_id IS NOT NULL AND a.shift_id = s.id AND a.shift_id NOT LIKE 'US_%')
                    OR
                    (
                        (a.shift_id IS NULL OR a.shift_id LIKE 'US_%') 
                        AND s.id = (
                            SELECT id FROM shift_instances 
                            WHERE user_id = r.user_id 
                              AND logical_date = COALESCE(
                                  a.date, 
                                  substr(r.requested_check_in, 1, 10), 
                                  substr(r.created_at, 1, 10)
                              )
                              AND status != 'Cancelled'
                            LIMIT 1
                        )
                    )
                )
                LEFT JOIN shift_interruptions si ON r.shift_interruption_id = si.id AND r.type IN ('permission_to_leave', 'shift_interruption_review')
                WHERE r.user_id = ?
                ORDER BY r.created_at DESC
            `).all(user.id);
        }

        res.json(requests);
    } catch (error) {
        logger.error('Error fetching requests:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const createAttendanceCorrection = (req: AuthRequest, res: Response): void => {
    try {
        const userId = req.user!.id;
        const { attendance_id, new_clock_in, new_clock_out, reason } = req.body;

        if (!attendance_id || !reason || (!new_clock_in && !new_clock_out)) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        const attendanceRecord = db.prepare('SELECT check_out, check_in, shift_id FROM attendance WHERE id = ? AND user_id = ?').get(attendance_id, userId) as any;
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

        const checkIn = new_clock_in || attendanceRecord.check_in;
        const checkOut = new_clock_out || attendanceRecord.check_out;
        if (checkIn && checkOut && new Date(checkIn) > new Date(checkOut)) {
            res.status(400).json({ error: 'Check-out time must be after check-in time.' });
            return;
        }

        let shiftInstance = null;
        if (attendanceRecord.shift_id && !attendanceRecord.shift_id.startsWith('US_')) {
            shiftInstance = db.prepare('SELECT * FROM shift_instances WHERE id = ?').get(attendanceRecord.shift_id) as any;
        }

        if (shiftInstance) {
            if (new_clock_in) {
                const checkInTime = new Date(new_clock_in);
                const startScheduled = new Date(shiftInstance.start_time);
                if (checkInTime < startScheduled) {
                    res.status(400).json({ error: 'Correction check-in time cannot be earlier than the scheduled shift start time.' });
                    return;
                }
            }
            if (new_clock_out) {
                const checkOutTime = new Date(new_clock_out);
                const endScheduled = new Date(shiftInstance.end_time);
                if (checkOutTime > endScheduled) {
                    res.status(400).json({ error: 'Correction check-out time cannot be later than the scheduled shift end time.' });
                    return;
                }
            }
        }

        const userProfile = db.prepare(`
            SELECT p.weekly_schedule
            FROM profiles p
            WHERE p.user_id = ?
        `).get(userId) as any;

        const settingsRecord = db.prepare('SELECT late_grace_period FROM settings WHERE id = 1').get() as any;

        const gracePeriod = settingsRecord?.late_grace_period !== undefined ? settingsRecord.late_grace_period : 0;

        let missingMinutes = 0;
        if (userProfile && userProfile.weekly_schedule) {
            try {
                if (shiftInstance) {
                    if (checkIn) {
                        const startScheduled = new Date(shiftInstance.start_time);
                        const checkInTime = new Date(checkIn);
                        if (checkInTime > startScheduled) {
                            const diff = getDifferenceInMinutes(startScheduled, checkInTime);
                            if (diff > gracePeriod) {
                                missingMinutes += diff;
                            }
                        }
                    }
                    if (checkOut) {
                        const endScheduled = new Date(shiftInstance.end_time);
                        const checkOutTime = new Date(checkOut);
                        if (checkOutTime < endScheduled) {
                            const diff = getDifferenceInMinutes(checkOutTime, endScheduled);
                            if (diff > gracePeriod) {
                                missingMinutes += diff;
                            }
                        }
                    }
                }
            } catch (e) {
                logger.error('Error calculating missing minutes for correction:', e);
            }
        }

        const insert = db.prepare(`
            INSERT INTO requests (user_id, attendance_id, type, requested_check_in, requested_check_out, reason, value, status)
            VALUES (?, ?, 'attendance_correction', ?, ?, ?, ?, 'pending')
        `);

        const info = insert.run(userId, attendance_id, new_clock_in || null, new_clock_out || null, reason, missingMinutes);
        const newReq = db.prepare('SELECT * FROM requests WHERE id = ?').get(info.lastInsertRowid);

        res.status(201).json(newReq);
    } catch (error) {
        logger.error('Error creating attendance correction request:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateRequestStatus = (req: Request, res: Response): void => {
    try {
        const actorId = (req as AuthRequest).user!.id;
        const { id } = req.params;
        const { status, manager_note, approved_minutes, paid_minutes, penalty_minutes } = req.body;

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
        if (requestRecord.type === 'permission_to_leave' && requestRecord.shift_interruption_id) {
            oldInterruption = db.prepare('SELECT * FROM shift_interruptions WHERE id = ?').get(requestRecord.shift_interruption_id) as any;
        }

        if (status === 'approved') {
            const finalPaidMinutes = requestRecord.type === 'overtime_approval'
                ? (approved_minutes !== undefined ? approved_minutes : (requestRecord.value || 0))
                : (paid_minutes || 0);

            let maxDuration = requestRecord.value || 0;
            if (requestRecord.type === 'late_in_approval' && !maxDuration) {
                const att = db.prepare('SELECT check_in, shift_id FROM attendance WHERE id = ?').get(requestRecord.attendance_id) as any;
                if (att && att.check_in && att.shift_id && !att.shift_id.startsWith('US_')) {
                    const shift = db.prepare('SELECT start_time FROM shift_instances WHERE id = ?').get(att.shift_id) as any;
                    if (shift) {
                        maxDuration = getDifferenceInMinutes(new Date(shift.start_time), new Date(att.check_in));
                    }
                }
            } else if (requestRecord.type === 'early_leave_approval' && !maxDuration) {
                const att = db.prepare('SELECT check_out, shift_id FROM attendance WHERE id = ?').get(requestRecord.attendance_id) as any;
                if (att && att.check_out && att.shift_id && !att.shift_id.startsWith('US_')) {
                    const shift = db.prepare('SELECT end_time FROM shift_instances WHERE id = ?').get(att.shift_id) as any;
                    if (shift) {
                        maxDuration = getDifferenceInMinutes(new Date(att.check_out), new Date(shift.end_time));
                    }
                }
            } else if ((requestRecord.type === 'permission_to_leave' || requestRecord.type === 'shift_interruption_review') && requestRecord.shift_interruption_id) {
                const si = db.prepare('SELECT start_time, end_time FROM shift_interruptions WHERE id = ?').get(requestRecord.shift_interruption_id) as any;
                if (si && si.start_time && si.end_time) {
                    maxDuration = getDifferenceInMinutes(new Date(si.start_time), new Date(si.end_time));
                }
            } else if (requestRecord.type === 'overtime_approval' && !maxDuration && requestRecord.attendance_id) {
                const att = db.prepare('SELECT check_in, check_out, shift_id FROM attendance WHERE id = ?').get(requestRecord.attendance_id) as any;
                if (att && att.check_in && att.check_out) {
                    if (att.shift_id && !att.shift_id.startsWith('US_')) {
                        const shift = db.prepare('SELECT start_time, end_time FROM shift_instances WHERE id = ?').get(att.shift_id) as any;
                        if (shift) {
                            const startScheduled = new Date(shift.start_time);
                            const endScheduled = new Date(shift.end_time);
                            const checkInTime = new Date(att.check_in);
                            const checkOutTime = new Date(att.check_out);
                            let ot = 0;
                            if (checkInTime < startScheduled) {
                                ot += getDifferenceInMinutes(checkInTime, startScheduled);
                            }
                            if (checkOutTime > endScheduled) {
                                ot += getDifferenceInMinutes(endScheduled, checkOutTime);
                            }
                            maxDuration = ot;
                        }
                    } else {
                        maxDuration = getDifferenceInMinutes(new Date(att.check_in), new Date(att.check_out));
                    }
                }
            }

            const needsDuration = ['permission_to_leave', 'shift_interruption_review', 'overtime_approval', 'early_leave_approval', 'late_in_approval'].includes(requestRecord.type || '');
            if (needsDuration && finalPaidMinutes > maxDuration) {
                res.status(400).json({ error: `Approved minutes (${finalPaidMinutes}) cannot exceed the maximum allowed period of ${maxDuration} minutes.` });
                return;
            }
        }

        const transaction = db.transaction(() => {
            const finalPaidMinutes = requestRecord.type === 'overtime_approval'
                ? (approved_minutes !== undefined ? approved_minutes : (requestRecord.value || 0))
                : (paid_minutes || 0);

            // Update the request status, manager note, paid_minutes and penalty_minutes
            db.prepare('UPDATE requests SET status = ?, manager_note = ?, paid_minutes = ?, penalty_minutes = ? WHERE id = ?').run(
                status,
                manager_note || null,
                finalPaidMinutes,
                penalty_minutes || 0,
                id
            );

            // If it's a permission_to_leave request, update shift_interruptions
            if (requestRecord.type === 'permission_to_leave' && requestRecord.shift_interruption_id) {
                const interruptionStatus = status === 'approved' ? 'manager_approved' : 'manager_rejected';
                db.prepare('UPDATE shift_interruptions SET status = ? WHERE id = ?').run(interruptionStatus, requestRecord.shift_interruption_id);
            }

            // If approved, handle specific request types
            if (status === 'approved') {
                if (requestRecord.type === 'attendance_correction') {
                    const new_clock_in = requestRecord.requested_check_in;
                    const new_clock_out = requestRecord.requested_check_out;

                    const originalAttendance = db.prepare('SELECT check_in, check_out FROM attendance WHERE id = ?').get(requestRecord.attendance_id) as any;

                    const updateQuery = `
                        UPDATE attendance
                        SET check_in = COALESCE(?, check_in),
                            check_out = COALESCE(?, check_out),
                            status = ?
                        WHERE id = ?
                    `;

                    // Recalculate status based on new check_in
                    let newStatus = 'on_time';
                    const finalCheckIn = new_clock_in || (originalAttendance ? originalAttendance.check_in : null);
                    const finalCheckOut = new_clock_out || (originalAttendance ? originalAttendance.check_out : null);
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
                            if (fullOriginalAttendance.shift_id && !fullOriginalAttendance.shift_id.startsWith('US_')) {
                                shiftInstance = db.prepare('SELECT * FROM shift_instances WHERE id = ?').get(fullOriginalAttendance.shift_id) as any;
                            }

                            if (shiftInstance) {
                                const scheduledTime = new Date(shiftInstance.start_time);
                                const clockInTime = new Date(finalCheckIn);
                                if (clockInTime > scheduledTime) {
                                    const diffMinutes = getDifferenceInMinutes(scheduledTime, clockInTime);
                                    if (diffMinutes > gracePeriod) {
                                        newStatus = 'late_in';
                                    }
                                }

                                if (newStatus === 'on_time' && finalCheckOut) {
                                    const scheduledEndTime = new Date(shiftInstance.end_time);
                                    const clockOutTime = new Date(finalCheckOut);
                                    if (clockOutTime < scheduledEndTime) {
                                        const outDiffMinutes = getDifferenceInMinutes(clockOutTime, scheduledEndTime);
                                        if (outDiffMinutes > gracePeriod) {
                                            newStatus = 'early_out';
                                        }
                                    }
                                }
                            } else {
                                newStatus = 'unscheduled';
                            }
                        }
                    }

                    db.prepare(updateQuery).run(
                        new_clock_in || null,
                        new_clock_out || null,
                        newStatus,
                        requestRecord.attendance_id
                    );

                    // Fetch other requests for this attendance
                    const relatedRequests = db.prepare(`
                        SELECT * FROM requests
                        WHERE attendance_id = ? AND type IN ('overtime_approval', 'late_in_approval', 'early_leave_approval')
                    `).all(requestRecord.attendance_id) as any[];

                    if (relatedRequests.length > 0) {
                        const settingsRecord = db.prepare('SELECT late_grace_period FROM settings WHERE id = 1').get() as any;
                        const gracePeriod = settingsRecord?.late_grace_period !== undefined ? settingsRecord.late_grace_period : 0;

                        let shiftInstance = null;
                        if (fullOriginalAttendance.shift_id && !fullOriginalAttendance.shift_id.startsWith('US_')) {
                            shiftInstance = db.prepare('SELECT * FROM shift_instances WHERE id = ?').get(fullOriginalAttendance.shift_id) as any;
                        }

                        for (const relReq of relatedRequests) {
                            if (relReq.type === 'late_in_approval') {
                                let lateMins = 0;
                                if (shiftInstance && finalCheckIn) {
                                    const startScheduled = new Date(shiftInstance.start_time);
                                    const clockInTime = new Date(finalCheckIn);
                                    if (clockInTime > startScheduled) {
                                        lateMins = getDifferenceInMinutes(startScheduled, clockInTime);
                                    }
                                }
                                if (lateMins > gracePeriod) {
                                    db.prepare("UPDATE requests SET status = 'pending', value = ?, paid_minutes = 0 WHERE id = ?").run(lateMins, relReq.id);
                                    db.prepare("DELETE FROM payroll_transactions WHERE reference_id = ?").run(relReq.id);
                                } else {
                                    db.prepare("DELETE FROM payroll_transactions WHERE reference_id = ?").run(relReq.id);
                                    db.prepare("DELETE FROM requests WHERE id = ?").run(relReq.id);
                                }
                            } else if (relReq.type === 'early_leave_approval') {
                                let earlyMins = 0;
                                if (shiftInstance && finalCheckOut) {
                                    const endScheduled = new Date(shiftInstance.end_time);
                                    const clockOutTime = new Date(finalCheckOut);
                                    if (clockOutTime < endScheduled) {
                                        earlyMins = getDifferenceInMinutes(clockOutTime, endScheduled);
                                    }
                                }
                                if (earlyMins > gracePeriod) {
                                    db.prepare("UPDATE requests SET status = 'pending', value = ?, paid_minutes = 0 WHERE id = ?").run(earlyMins, relReq.id);
                                    db.prepare("DELETE FROM payroll_transactions WHERE reference_id = ?").run(relReq.id);
                                } else {
                                    db.prepare("DELETE FROM payroll_transactions WHERE reference_id = ?").run(relReq.id);
                                    db.prepare("DELETE FROM requests WHERE id = ?").run(relReq.id);
                                }
                            } else if (relReq.type === 'overtime_approval') {
                                let newOtMinutes = 0;
                                if (shiftInstance) {
                                    if (finalCheckIn) {
                                        const startScheduled = new Date(shiftInstance.start_time);
                                        const clockInTime = new Date(finalCheckIn);
                                        if (clockInTime < startScheduled) {
                                            newOtMinutes += getDifferenceInMinutes(clockInTime, startScheduled);
                                        }
                                    }
                                    if (finalCheckOut) {
                                        const endScheduled = new Date(shiftInstance.end_time);
                                        const clockOutTime = new Date(finalCheckOut);
                                        if (clockOutTime > endScheduled) {
                                            newOtMinutes += getDifferenceInMinutes(endScheduled, clockOutTime);
                                        }
                                    }
                                } else {
                                    if (finalCheckIn && finalCheckOut) {
                                        newOtMinutes = getDifferenceInMinutes(finalCheckIn, finalCheckOut);
                                    }
                                }

                                if (newOtMinutes > 0) {
                                    db.prepare("UPDATE requests SET status = 'pending', value = ?, paid_minutes = 0 WHERE id = ?").run(newOtMinutes, relReq.id);
                                    db.prepare("DELETE FROM payroll_transactions WHERE reference_id = ?").run(relReq.id);
                                } else {
                                    db.prepare("DELETE FROM payroll_transactions WHERE reference_id = ?").run(relReq.id);
                                    db.prepare("DELETE FROM requests WHERE id = ?").run(relReq.id);
                                }
                            }
                        }
                    }
                } else if (requestRecord.type === 'early_leave_approval' && requestRecord.attendance_id) {
                    db.prepare("UPDATE attendance SET status = 'on_time' WHERE id = ? AND status = 'early_out'").run(requestRecord.attendance_id);
                } else if (requestRecord.type === 'late_in_approval' && requestRecord.attendance_id) {
                    db.prepare("UPDATE attendance SET status = 'on_time' WHERE id = ? AND status = 'late_in'").run(requestRecord.attendance_id);
                } else if (requestRecord.type === 'manual_clock' && (requestRecord.requested_check_in || requestRecord.requested_check_out)) {
                    if (requestRecord.attendance_id) {
                        const originalAttendance = db.prepare('SELECT check_in, check_out FROM attendance WHERE id = ?').get(requestRecord.attendance_id) as any;

                        // Recalculate status based on new check_in
                        let newStatus = 'on_time';
                        const finalCheckIn = requestRecord.requested_check_in || (originalAttendance ? originalAttendance.check_in : null);

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
                                if (fullOriginalAttendance.shift_id && !fullOriginalAttendance.shift_id.startsWith('US_')) {
                                    shiftInstance = db.prepare('SELECT * FROM shift_instances WHERE id = ?').get(fullOriginalAttendance.shift_id) as any;
                                }

                                if (shiftInstance) {
                                    const scheduledTime = new Date(shiftInstance.start_time);
                                    const clockInTime = new Date(finalCheckIn);
                                    if (clockInTime > scheduledTime) {
                                        const diffMinutes = getDifferenceInMinutes(scheduledTime, clockInTime);
                                        if (diffMinutes > gracePeriod) {
                                            newStatus = 'late_in';
                                        }
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

                            const settingsRecord = db.prepare('SELECT late_grace_period FROM settings WHERE id = 1').get() as any;
                            const gracePeriod = settingsRecord?.late_grace_period !== undefined ? settingsRecord.late_grace_period : 0;

                            if (userProfile) {
                                const shiftInstance = db.prepare(`
                                    SELECT * FROM shift_instances
                                    WHERE user_id = ? AND ? BETWEEN datetime(start_time, '-' || ? || ' minutes') AND end_time
                                    ORDER BY start_time ASC LIMIT 1
                                `).get(requestRecord.user_id, requestRecord.requested_check_in, gracePeriod) as any;

                                if (shiftInstance) {
                                    const scheduledTime = new Date(shiftInstance.start_time);
                                    const clockInTime = new Date(requestRecord.requested_check_in);
                                    if (clockInTime > scheduledTime) {
                                        const diffMinutes = getDifferenceInMinutes(scheduledTime, clockInTime);
                                        if (diffMinutes > gracePeriod) {
                                            newStatus = 'late_in';
                                        }
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
                const requestedMinutes = requestRecord.value || 0;
                const minutes = status === 'approved' ? (approved_minutes !== undefined ? approved_minutes : requestedMinutes) : requestedMinutes;
                const hours = isNaN(minutes) || minutes === null ? 0 : minutes / 60;
                const amount = status === 'approved' ? hours * (hourlyRate * 1.5) : 0; // Overtime is 1.5x

                db.prepare(`
                    INSERT INTO payroll_transactions (payroll_id, reference_id, type, hours, amount, status, manager_notes)
                    VALUES (?, ?, 'overtime', ?, ?, ?, ?)
                `).run(payrollId, id, hours, amount, status === 'approved' ? 'applied' : 'rejected', manager_note);
            } else if (requestRecord.type === 'permission_to_leave') {
                const finalPaidMinutes = paid_minutes || 0;
                const finalPaidHours = finalPaidMinutes / 60;
                const totalHours = (requestRecord.value || 0) / 60;
                const unpaidHours = Math.max(0, totalHours - finalPaidHours);

                if (status === 'approved' && unpaidHours > 0) {
                    const amount = unpaidHours * hourlyRate;
                    db.prepare(`
                        INSERT INTO payroll_transactions (payroll_id, reference_id, type, hours, amount, status, manager_notes)
                        VALUES (?, ?, 'step_away_unpaid', ?, ?, 'applied', ?)
                    `).run(payrollId, id, unpaidHours, amount, manager_note);
                } else if (status === 'rejected') {
                    db.prepare(`
                        INSERT INTO payroll_transactions (payroll_id, reference_id, type, hours, amount, status, manager_notes)
                        VALUES (?, ?, 'step_away_unpaid', ?, 0, 'rejected', ?)
                    `).run(payrollId, id, totalHours, manager_note);
                }
            }

            // Disciplinary Penalty Logic
            const finalPenaltyMinutes = penalty_minutes !== undefined ? penalty_minutes : (requestRecord.penalty_minutes || 0);
            if (status === 'rejected' && finalPenaltyMinutes > 0) {
                const penaltyHours = finalPenaltyMinutes / 60;
                const penaltyAmount = penaltyHours * hourlyRate;
                db.prepare(`
                    INSERT INTO payroll_transactions (payroll_id, reference_id, type, hours, amount, status, manager_notes)
                    VALUES (?, ?, 'disciplinary_penalty', ?, ?, 'applied', ?)
                `).run(payrollId, id, penaltyHours, penaltyAmount, manager_note);
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
            const newInterruption = db.prepare('SELECT * FROM shift_interruptions WHERE id = ?').get(requestRecord.shift_interruption_id) as any;
            if (JSON.stringify(oldInterruption) !== JSON.stringify(newInterruption)) {
                logAudit('shift_interruptions', requestRecord.shift_interruption_id, 'UPDATE', actorId, oldInterruption, newInterruption);
            }
        }

        res.json(updatedRequest);
    } catch (error) {
        logger.error('Error updating request status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
