import { Request, Response } from 'express';
import db from '../db/index.js';
import { AuthRequest } from '../middlewares/authMiddleware.js';

import { recalculateUserDailyAttendance } from '../services/dailyAttendanceService.js';
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

        // Manual Clock Slicing Logic
        if (requestType === 'manual_clock') {
            if (!requested_check_in || !requested_check_out) {
                res.status(400).json({ error: 'Check-in and Check-out times are required for manual clock requests.' });
                return;
            }

            const reqStart = new Date(requested_check_in);
            const reqEnd = new Date(requested_check_out);

            if (reqStart >= reqEnd) {
                res.status(400).json({ error: 'Check-out time must be after check-in time.' });
                return;
            }

            // Fetch overlapping shift instances
            const overlappingShifts = db.prepare(`
                SELECT * FROM shift_instances
                WHERE user_id = ? AND status != 'Cancelled'
                  AND NOT (end_time <= ? OR start_time >= ?)
                ORDER BY start_time ASC
            `).all(userId, requested_check_in, requested_check_out) as any[];

            const segments: { start: string; end: string; shiftId: string | null }[] = [];
            let currentTime = reqStart.getTime();

            for (const shift of overlappingShifts) {
                const shiftStart = new Date(shift.start_time).getTime();
                const shiftEnd = new Date(shift.end_time).getTime();

                // 1. Unscheduled segment before the shift start
                if (shiftStart > currentTime) {
                    const segmentEnd = Math.min(shiftStart, reqEnd.getTime());
                    segments.push({
                        start: new Date(currentTime).toISOString(),
                        end: new Date(segmentEnd).toISOString(),
                        shiftId: null
                    });
                    currentTime = segmentEnd;
                }

                if (currentTime >= reqEnd.getTime()) break;

                // 2. Scheduled segment inside the shift
                const segmentEnd = Math.min(shiftEnd, reqEnd.getTime());
                if (segmentEnd > currentTime) {
                    segments.push({
                        start: new Date(currentTime).toISOString(),
                        end: new Date(segmentEnd).toISOString(),
                        shiftId: shift.id.toString()
                    });
                    currentTime = segmentEnd;
                }

                if (currentTime >= reqEnd.getTime()) break;
            }

            // 3. Final unscheduled segment after the last shift
            if (currentTime < reqEnd.getTime()) {
                segments.push({
                    start: new Date(currentTime).toISOString(),
                    end: new Date(reqEnd.getTime()).toISOString(),
                    shiftId: null
                });
            }

            // Overlap Validation Checks
            for (const seg of segments) {
                // Check against existing attendance
                const overlapAtt = db.prepare(`
                    SELECT id FROM attendance
                    WHERE user_id = ?
                      AND NOT (check_out <= ? OR check_in >= ?)
                `).get(userId, seg.start, seg.end);

                if (overlapAtt) {
                    res.status(400).json({ error: 'The requested period overlaps with an existing attendance record.' });
                    return;
                }

                // Check against pending manual clock requests
                const overlapReq = db.prepare(`
                    SELECT id FROM requests
                    WHERE user_id = ? AND status = 'pending' AND type = 'manual_clock'
                      AND NOT (requested_check_out <= ? OR requested_check_in >= ?)
                `).get(userId, seg.start, seg.end);

                if (overlapReq) {
                    res.status(400).json({ error: 'A pending manual clock request already overlaps with this period.' });
                    return;
                }
            }

            // Batch insert requests in a transaction
            const createdRequests = db.transaction(() => {
                const inserted = [];
                const insertStmt = db.prepare(`
                    INSERT INTO requests (user_id, attendance_id, requested_check_in, requested_check_out, type, reason, value, status, manager_note, shift_id)
                    VALUES (?, NULL, ?, ?, 'manual_clock', ?, 0, 'pending', NULL, ?)
                `);

                for (const seg of segments) {
                    const info = insertStmt.run(userId, seg.start, seg.end, reason, seg.shiftId);
                    const reqRecord = db.prepare('SELECT * FROM requests WHERE id = ?').get(info.lastInsertRowid);
                    logAudit('requests', info.lastInsertRowid as number, 'CREATE', userId, null, reqRecord);
                    inserted.push(reqRecord);
                }
                return inserted;
            })();

            res.status(201).json(createdRequests.length === 1 ? createdRequests[0] : createdRequests);
            return;
        }

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

        let status = 'pending';
        let managerNote = null;
        const settings = db.prepare('SELECT min_overtime_minutes FROM settings WHERE id = 1').get() as any;
        if (requestType === 'overtime_approval' && settings) {
            const minOT = settings.min_overtime_minutes || 0;
            if ((value || 0) < minOT) {
                status = 'rejected';
                managerNote = 'Auto-rejected: request duration is less than the minimum overtime period.';
            }
        }

        const insert = db.prepare(`
            INSERT INTO requests (user_id, attendance_id, requested_check_in, requested_check_out, type, reason, value, status, manager_note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const info = insert.run(
            userId,
            attendance_id || null,
            requested_check_in || null,
            requested_check_out || null,
            requestType,
            reason,
            value || 0,
            status,
            managerNote
        );
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
                SELECT r.*, u.name as user_name, p.profile_picture_url, a.date as attendance_date, a.check_in as original_check_in, a.check_out as original_check_out, 
                       a.shift_id as attendance_shift_id,
                       (SELECT COALESCE(SUM(r2.paid_minutes), 0) FROM requests r2 WHERE r2.attendance_id = a.id AND r2.status = 'approved' AND r2.type = 'overtime_approval') as approved_overtime_minutes,
                       si.start_time as interruption_start_time, si.end_time as interruption_end_time,
                       s.id as shift_instance_id, s.start_time as shift_start_time, s.end_time as shift_end_time, s.logical_date as shift_logical_date
                FROM requests r
                JOIN users u ON r.user_id = u.id
                LEFT JOIN profiles p ON u.id = p.user_id
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
                SELECT r.*, u.name as user_name, p.profile_picture_url, a.date as attendance_date, a.check_in as original_check_in, a.check_out as original_check_out, 
                       a.shift_id as attendance_shift_id,
                       (SELECT COALESCE(SUM(r2.paid_minutes), 0) FROM requests r2 WHERE r2.attendance_id = a.id AND r2.status = 'approved' AND r2.type = 'overtime_approval') as approved_overtime_minutes,
                       si.start_time as interruption_start_time, si.end_time as interruption_end_time,
                       s.id as shift_instance_id, s.start_time as shift_start_time, s.end_time as shift_end_time, s.logical_date as shift_logical_date
                FROM requests r
                JOIN users u ON r.user_id = u.id
                LEFT JOIN profiles p ON u.id = p.user_id
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
        const isUnscheduled = !attendanceRecord.shift_id || attendanceRecord.shift_id.startsWith('US_');

        if (isUnscheduled) {
            // 1. Check overlap with any other existing attendance records for the user
            const overlapAtt = db.prepare(`
                SELECT id FROM attendance
                WHERE user_id = ? AND id != ?
                  AND NOT (check_out <= ? OR check_in >= ?)
            `).get(userId, attendance_id, checkIn, checkOut);

            if (overlapAtt) {
                res.status(400).json({ error: 'Correction overlaps with an existing attendance record.' });
                return;
            }

            // 2. Check overlap with any scheduled shift of the user
            const overlapShift = db.prepare(`
                SELECT id FROM shift_instances
                WHERE user_id = ? AND status != 'Cancelled'
                  AND NOT (end_time <= ? OR start_time >= ?)
            `).get(userId, checkIn, checkOut);

            if (overlapShift) {
                res.status(400).json({ error: 'Correction overlaps with an existing scheduled shift.' });
                return;
            }
        }

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

        const info = insert.run(userId, attendance_id, checkIn || null, checkOut || null, reason, missingMinutes);
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
            const finalPaidMinutes = status === 'rejected'
                ? 0
                : (requestRecord.type === 'overtime_approval'
                    ? (approved_minutes !== undefined ? approved_minutes : (requestRecord.value || 0))
                    : (paid_minutes || 0));

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

                    let checkinStatus = 'on_time';
                    const finalCheckIn = new_clock_in || (originalAttendance ? originalAttendance.check_in : null);
                    const finalCheckOut = new_clock_out || (originalAttendance ? originalAttendance.check_out : null);
                    let checkoutStatus = finalCheckOut ? 'on_time' : null;
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
                                        checkinStatus = 'late_in';
                                    }
                                }
 
                                if (finalCheckOut) {
                                    const scheduledEndTime = new Date(shiftInstance.end_time);
                                    const clockOutTime = new Date(finalCheckOut);
                                    if (clockOutTime < scheduledEndTime) {
                                        const outDiffMinutes = getDifferenceInMinutes(clockOutTime, scheduledEndTime);
                                        if (outDiffMinutes > gracePeriod) {
                                            checkoutStatus = 'early_out';
                                        }
                                    }
                                }
                            } else {
                                checkinStatus = 'unscheduled';
                                if (finalCheckOut) {
                                    checkoutStatus = 'unscheduled';
                                }
                            }
                        }
                    }
 
                    const updateQuery = `
                        UPDATE attendance
                        SET check_in = COALESCE(?, check_in),
                            check_out = COALESCE(?, check_out),
                            checkin_status = ?,
                            checkout_status = ?
                        WHERE id = ?
                    `;
 
                    db.prepare(updateQuery).run(
                        new_clock_in || null,
                        new_clock_out || null,
                        checkinStatus,
                        checkoutStatus,
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
                                } else {
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
                                } else {
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
                                } else {
                                    db.prepare("DELETE FROM requests WHERE id = ?").run(relReq.id);
                                }
                            }
                        }
                    }
                } else if (requestRecord.type === 'early_leave_approval' && requestRecord.attendance_id) {
                    db.prepare("UPDATE attendance SET checkout_status = 'on_time' WHERE id = ? AND checkout_status = 'early_out'").run(requestRecord.attendance_id);
                } else if (requestRecord.type === 'late_in_approval' && requestRecord.attendance_id) {
                    db.prepare("UPDATE attendance SET checkin_status = 'on_time' WHERE id = ? AND checkin_status = 'late_in'").run(requestRecord.attendance_id);
                } else if (requestRecord.type === 'manual_clock' && (requestRecord.requested_check_in || requestRecord.requested_check_out)) {
                    if (requestRecord.attendance_id) {
                        const originalAttendance = db.prepare('SELECT check_in, check_out, shift_id FROM attendance WHERE id = ?').get(requestRecord.attendance_id) as any;
 
                        // Recalculate checkin_status and checkout_status
                        let checkinStatus = 'on_time';
                        const finalCheckIn = requestRecord.requested_check_in || (originalAttendance ? originalAttendance.check_in : null);
                        const finalCheckOut = requestRecord.requested_check_out || (originalAttendance ? originalAttendance.check_out : null);
                        let checkoutStatus = finalCheckOut ? 'on_time' : null;
 
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
                                            checkinStatus = 'late_in';
                                        }
                                    }
 
                                    if (finalCheckOut) {
                                        const scheduledEndTime = new Date(shiftInstance.end_time);
                                        const clockOutTime = new Date(finalCheckOut);
                                        if (clockOutTime < scheduledEndTime) {
                                            const outDiffMinutes = getDifferenceInMinutes(clockOutTime, scheduledEndTime);
                                            if (outDiffMinutes > gracePeriod) {
                                                checkoutStatus = 'early_out';
                                            }
                                        }
                                    }
                                } else {
                                    checkinStatus = 'unscheduled';
                                    if (finalCheckOut) {
                                        checkoutStatus = 'unscheduled';
                                    }
                                }
                            }
                        }
 
                        // Update existing attendance
                        const updateQuery = `
                            UPDATE attendance
                            SET check_in = COALESCE(?, check_in),
                                check_out = COALESCE(?, check_out),
                                checkin_status = ?,
                                checkout_status = ?
                            WHERE id = ?
                        `;
                        db.prepare(updateQuery).run(
                            requestRecord.requested_check_in,
                            requestRecord.requested_check_out,
                            checkinStatus,
                            checkoutStatus,
                            requestRecord.attendance_id
                        );
                    } else {
                        // Insert new attendance
                        const timeString = requestRecord.requested_check_in || requestRecord.requested_check_out;
                        const date = new Date(timeString).toISOString().split('T')[0];
 
                        // Recalculate status based on check_in
                        let checkinStatus = 'on_time';
                        let checkoutStatus = requestRecord.requested_check_out ? 'on_time' : null;
                        let shiftId = requestRecord.shift_id;
  
                        const settingsRecord = db.prepare('SELECT late_grace_period FROM settings WHERE id = 1').get() as any;
                        const gracePeriod = settingsRecord?.late_grace_period !== undefined ? settingsRecord.late_grace_period : 0;
  
                        if (shiftId) {
                            const shiftInstance = db.prepare('SELECT * FROM shift_instances WHERE id = ?').get(shiftId) as any;
                            if (shiftInstance) {
                                const scheduledTime = new Date(shiftInstance.start_time);
                                const clockInTime = new Date(requestRecord.requested_check_in);
                                if (clockInTime > scheduledTime) {
                                    const diffMinutes = getDifferenceInMinutes(scheduledTime, clockInTime);
                                    if (diffMinutes > gracePeriod) {
                                        checkinStatus = 'late_in';
                                    }
                                }
  
                                if (requestRecord.requested_check_out) {
                                    const scheduledEndTime = new Date(shiftInstance.end_time);
                                    const clockOutTime = new Date(requestRecord.requested_check_out);
                                    if (clockOutTime < scheduledEndTime) {
                                        const outDiffMinutes = getDifferenceInMinutes(clockOutTime, scheduledEndTime);
                                        if (outDiffMinutes > gracePeriod) {
                                            checkoutStatus = 'early_out';
                                        }
                                    }
                                }
                            } else {
                                checkinStatus = 'unscheduled';
                                if (requestRecord.requested_check_out) {
                                    checkoutStatus = 'unscheduled';
                                }
                            }
                        } else {
                            // Legacy fallback (no shift_id on request)
                            if (requestRecord.requested_check_in) {
                                const userProfile = db.prepare(`
                                    SELECT p.weekly_schedule
                                    FROM profiles p
                                    WHERE p.user_id = ?
                                `).get(requestRecord.user_id) as any;
  
                                if (userProfile) {
                                    const shiftInstance = db.prepare(`
                                        SELECT * FROM shift_instances
                                        WHERE user_id = ? AND ? BETWEEN datetime(start_time, '-' || ? || ' minutes') AND end_time
                                        ORDER BY start_time ASC LIMIT 1
                                    `).get(requestRecord.user_id, requestRecord.requested_check_in, gracePeriod) as any;
  
                                    if (shiftInstance) {
                                        shiftId = shiftInstance.id.toString();
                                        const scheduledTime = new Date(shiftInstance.start_time);
                                        const clockInTime = new Date(requestRecord.requested_check_in);
                                        if (clockInTime > scheduledTime) {
                                            const diffMinutes = getDifferenceInMinutes(scheduledTime, clockInTime);
                                            if (diffMinutes > gracePeriod) {
                                                checkinStatus = 'late_in';
                                            }
                                        }
  
                                        if (requestRecord.requested_check_out) {
                                            const scheduledEndTime = new Date(shiftInstance.end_time);
                                            const clockOutTime = new Date(requestRecord.requested_check_out);
                                            if (clockOutTime < scheduledEndTime) {
                                                const outDiffMinutes = getDifferenceInMinutes(clockOutTime, scheduledEndTime);
                                                if (outDiffMinutes > gracePeriod) {
                                                    checkoutStatus = 'early_out';
                                                }
                                            }
                                        }
                                    } else {
                                        checkinStatus = 'unscheduled';
                                        if (requestRecord.requested_check_out) {
                                            checkoutStatus = 'unscheduled';
                                        }
                                    }
                                }
                            }
                        }
  
                        db.prepare(`
                            INSERT INTO attendance (user_id, check_in, check_out, date, checkin_status, checkout_status, working_status, shift_id)
                            VALUES (?, ?, ?, ?, ?, ?, 'working', ?)
                        `).run(
                            requestRecord.user_id,
                            requestRecord.requested_check_in,
                            requestRecord.requested_check_out,
                            date,
                            checkinStatus,
                            checkoutStatus,
                            shiftId
                        );
                    }
                }
            }

            // --- Recalculate and Seal Daily Attendance ---
            let requestDate = null;
            if (requestRecord.attendance_id) {
                const att = db.prepare('SELECT date FROM attendance WHERE id = ?').get(requestRecord.attendance_id) as any;
                if (att) {
                    requestDate = att.date;
                }
            }
            if (!requestDate) {
                requestDate = requestRecord.requested_check_in 
                    ? requestRecord.requested_check_in.split('T')[0] 
                    : requestRecord.created_at.split('T')[0];
            }

            if (requestDate) {
                recalculateUserDailyAttendance(requestRecord.user_id, requestDate);
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
