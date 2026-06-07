import db from '../db/index.js';
import logger from '../utils/logger.js';
import { getAppNow, getDifferenceInMinutes, generateUnscheduledShiftId } from "../utils/timeManager.js";
import { getSettingsCache, setSettingsCache } from '../utils/cache.js';
import { recalculateUserDailyAttendance } from './dailyAttendanceService.js';

// Helper to insert overtime request with min overtime check
function insertOvertimeRequest(userId: number, attendanceId: number | null, reason: string, value: number) {
    let settings = getSettingsCache();
    if (!settings) {
        settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
        setSettingsCache(settings);
    }
    const minOT = settings?.min_overtime_minutes || 0;
    const status = value < minOT ? 'rejected' : 'pending';
    const managerNote = value < minOT ? 'Auto-rejected: request duration is less than the minimum overtime period.' : null;
    
    db.prepare(`
        INSERT INTO requests (user_id, attendance_id, type, reason, value, status, manager_note)
        VALUES (?, ?, 'overtime_approval', ?, ?, ?, ?)
    `).run(userId, attendanceId, reason, value, status, managerNote);
}

// Helper to insert late in or early leave request with grace period check
function insertLateInOrEarlyLeaveRequest(userId: number, attendanceId: number, type: 'late_in_approval' | 'early_leave_approval', reason: string, value: number) {
    let settings = getSettingsCache();
    if (!settings) {
        settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
        setSettingsCache(settings);
    }
    const grace = settings?.late_grace_period || 0;
    const status = value <= grace ? 'approved' : 'pending';
    const managerNote = value <= grace ? 'Auto-approved: within late grace period.' : null;
    
    db.prepare(`
        INSERT INTO requests (user_id, attendance_id, type, reason, value, status, manager_note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(userId, attendanceId, type, reason, value, status, managerNote);
    
    if (status === 'approved') {
        if (type === 'late_in_approval') {
            db.prepare("UPDATE attendance SET checkin_status = 'on_time' WHERE id = ?").run(attendanceId);
        } else {
            db.prepare("UPDATE attendance SET checkout_status = 'on_time' WHERE id = ?").run(attendanceId);
        }
        const att = db.prepare("SELECT date FROM attendance WHERE id = ?").get(attendanceId) as any;
        if (att) {
            recalculateUserDailyAttendance(userId, att.date);
        }
    }
}

let findLastHeartbeatStmt: any = null;
const getFindLastHeartbeatStmt = () => {
    if (!findLastHeartbeatStmt) {
        findLastHeartbeatStmt = db.prepare(`
            SELECT timestamp FROM attendance_heartbeats
            WHERE user_id = ? AND status = 'success' AND timestamp >= ? AND timestamp <= ?
            ORDER BY timestamp DESC
            LIMIT 1
        `);
    }
    return findLastHeartbeatStmt;
};

export const evaluateUserAttendance = (userId: number): void => {
    logger.debug('[evaluateUserAttendance] Entry: userId=', userId);
    try {
        const evaluate = db.transaction((uid: number) => {
            logger.debug('[evaluateUserAttendance] Transaction Entry: uid=', uid);
            const now = getAppNow();
            logger.debug('[evaluateUserAttendance] now=', now);

            const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
            const gracePeriod = settings?.late_grace_period !== undefined ? settings.late_grace_period : 0;

            // Scenario B: Scheduled Shift extending into Overtime
            const activeScheduled = db.prepare(`
                SELECT a.*, s.end_time as scheduled_end_time, s.id as shift_instance_id, s.logical_date
                FROM attendance a
                JOIN shift_instances s ON a.shift_id = s.id
                WHERE a.user_id = ? AND a.check_out IS NULL AND s.status = 'Scheduled'
                  AND s.end_time <= ?
                LIMIT 1
            `).get(uid, now) as any;

            if (activeScheduled) {
                logger.debug('[evaluateUserAttendance] activeScheduled Branch Entry');

                // Check heartbeats to detect if employee left early
                const lastHeartbeat = getFindLastHeartbeatStmt().get(uid, activeScheduled.check_in, activeScheduled.scheduled_end_time) as any;

                let lastSuccessfulHeartbeatMs: number;
                if (lastHeartbeat) {
                    lastSuccessfulHeartbeatMs = new Date(lastHeartbeat.timestamp).getTime();
                } else {
                    lastSuccessfulHeartbeatMs = new Date(activeScheduled.check_in).getTime();
                }

                const effectiveCheckOutMs = lastSuccessfulHeartbeatMs + 15 * 60 * 1000;
                const scheduledEndMs = new Date(activeScheduled.scheduled_end_time).getTime();

                if (effectiveCheckOutMs < scheduledEndMs) {
                    logger.debug('[evaluateUserAttendance] Heartbeats stopped early. Auto-closing shift.');

                    const minClockSessionMins = settings?.min_clock_session_minutes !== undefined ? settings.min_clock_session_minutes : 1;
                    const totalMinsFloat = (effectiveCheckOutMs - new Date(activeScheduled.check_in).getTime()) / 60000;

                    if (totalMinsFloat < minClockSessionMins) {
                        logger.info(`Auto-closed session ignored for User ${uid}: total duration is ${totalMinsFloat.toFixed(2)} mins (minimum required: ${minClockSessionMins} mins).`);
                        db.prepare('DELETE FROM requests WHERE attendance_id = ?').run(activeScheduled.id);
                        db.prepare('DELETE FROM shift_interruptions WHERE attendance_id = ?').run(activeScheduled.id);
                        db.prepare('DELETE FROM attendance WHERE id = ?').run(activeScheduled.id);
                        
                        db.prepare(`
                            UPDATE shift_instances SET status = 'Scheduled' WHERE id = ?
                        `).run(activeScheduled.shift_instance_id);
                    } else {
                        const effectiveCheckOutISO = new Date(effectiveCheckOutMs).toISOString();

                        let checkoutStatus = 'on_time';
                        const earlyMinutes = getDifferenceInMinutes(effectiveCheckOutISO, activeScheduled.scheduled_end_time);
                        if (earlyMinutes > gracePeriod) {
                            checkoutStatus = 'early_out';
                        }
     
                        // Auto-Close Session
                        db.prepare(`
                            UPDATE attendance 
                            SET check_out = ?, check_out_lat = ?, check_out_lng = ?, checkout_status = ?
                            WHERE id = ?
                        `).run(
                            effectiveCheckOutISO, 
                            activeScheduled.check_in_lat, 
                            activeScheduled.check_in_lng, 
                            checkoutStatus,
                            activeScheduled.id
                        );

                        // End the active step_away interruption if any
                        db.prepare(`
                            UPDATE shift_interruptions
                            SET end_time = ?
                            WHERE attendance_id = ? AND type = 'step_away' AND end_time IS NULL
                        `).run(effectiveCheckOutISO, activeScheduled.id);

                        // Update shift instance status
                        db.prepare(`
                            UPDATE shift_instances SET status = 'Completed' WHERE id = ?
                        `).run(activeScheduled.shift_instance_id);
                    }

                } else {
                    // Check if this is the final shift of the day
                    const futureShiftsToday = db.prepare(`
                        SELECT id FROM shift_instances
                        WHERE user_id = ? AND logical_date = ? AND start_time >= ? AND status = 'Scheduled'
                        LIMIT 1
                    `).get(uid, activeScheduled.logical_date, activeScheduled.scheduled_end_time) as any;
                    const isFinalShift = !futureShiftsToday;

                    if (activeScheduled.working_status === 'away' && isFinalShift) {
                        logger.debug('[evaluateUserAttendance] activeScheduled is final shift and away. Auto-terminating break.');
                        // Auto-Terminate Stepaway and Clock-out
                        db.prepare(`
                            UPDATE attendance SET check_out = ?, check_out_lat = ?, check_out_lng = ?, checkout_status = 'on_time' WHERE id = ?
                        `).run(activeScheduled.scheduled_end_time, activeScheduled.check_in_lat, activeScheduled.check_in_lng, activeScheduled.id);
 
                        // End the active step_away interruption
                        db.prepare(`
                            UPDATE shift_interruptions
                            SET end_time = ?
                            WHERE attendance_id = ? AND type = 'step_away' AND end_time IS NULL
                        `).run(activeScheduled.scheduled_end_time, activeScheduled.id);
 
                        db.prepare(`
                            UPDATE shift_instances SET status = 'Completed' WHERE id = ?
                        `).run(activeScheduled.shift_instance_id);
                    } else {
                        logger.debug('[evaluateUserAttendance] activeScheduled is NOT final shift and away. Ending scheduled and creating unscheduled.');
                        // End scheduled attendance
                        db.prepare(`
                            UPDATE attendance SET check_out = ?, check_out_lat = ?, check_out_lng = ?, checkout_status = 'on_time' WHERE id = ?
                        `).run(activeScheduled.scheduled_end_time, activeScheduled.check_in_lat, activeScheduled.check_in_lng, activeScheduled.id);
 
                        const unscheduledShiftId = generateUnscheduledShiftId(uid, now);
 
                        // Insert new active unscheduled attendance
                        db.prepare(`
                            INSERT INTO attendance (user_id, check_in, check_out, date, check_in_lat, check_in_lng, checkin_status, checkout_status, working_status, shift_id)
                            VALUES (?, ?, NULL, ?, ?, ?, 'unscheduled', NULL, 'working', ?)
                        `).run(uid, activeScheduled.scheduled_end_time, activeScheduled.date, activeScheduled.check_in_lat, activeScheduled.check_in_lng, unscheduledShiftId);

                        // Update shift instance status
                        db.prepare(`
                            UPDATE shift_instances SET status = 'Completed' WHERE id = ?
                        `).run(activeScheduled.shift_instance_id);
                    }
                }
            }

            // Scenario A: Unscheduled Early Check-in flowing into a Scheduled Shift
            const activeUnscheduled = db.prepare(`
                SELECT a.*
                FROM attendance a
                WHERE a.user_id = ? AND a.check_out IS NULL
                  AND (a.checkin_status = 'unscheduled' OR a.shift_id IS NULL)
                LIMIT 1
            `).get(uid) as any;

            if (activeUnscheduled) {
                logger.debug('[evaluateUserAttendance] activeUnscheduled Branch Entry');

                // Check heartbeats to detect if employee stopped working on the unscheduled shift
                const lastHeartbeat = getFindLastHeartbeatStmt().get(uid, activeUnscheduled.check_in, now) as any;

                let lastSuccessfulHeartbeatMs: number;
                if (lastHeartbeat) {
                    lastSuccessfulHeartbeatMs = new Date(lastHeartbeat.timestamp).getTime();
                } else {
                    lastSuccessfulHeartbeatMs = new Date(activeUnscheduled.check_in).getTime();
                }

                const effectiveCheckOutMs = lastSuccessfulHeartbeatMs + 15 * 60 * 1000;

                if (new Date(now).getTime() > effectiveCheckOutMs) {
                    logger.debug('[evaluateUserAttendance] Heartbeats stopped for active unscheduled shift. Auto-closing.');

                    const minClockSessionMins = settings?.min_clock_session_minutes !== undefined ? settings.min_clock_session_minutes : 1;
                    const minUnscheduledSessionMins = settings?.min_unscheduled_session_minutes !== undefined ? settings.min_unscheduled_session_minutes : 5;
                    const totalMinsFloat = (effectiveCheckOutMs - new Date(activeUnscheduled.check_in).getTime()) / 60000;

                    if (totalMinsFloat < minClockSessionMins || totalMinsFloat < minUnscheduledSessionMins) {
                        logger.info(`Auto-closed unscheduled session ignored for User ${uid}: total duration is ${totalMinsFloat.toFixed(2)} mins (minimum required: ${Math.max(minClockSessionMins, minUnscheduledSessionMins)} mins).`);
                        db.prepare('DELETE FROM requests WHERE attendance_id = ?').run(activeUnscheduled.id);
                        db.prepare('DELETE FROM shift_interruptions WHERE attendance_id = ?').run(activeUnscheduled.id);
                        db.prepare('DELETE FROM attendance WHERE id = ?').run(activeUnscheduled.id);
                    } else {
                        const effectiveCheckOutISO = new Date(effectiveCheckOutMs).toISOString();

                        // Auto-Close Session
                        db.prepare(`
                            UPDATE attendance 
                            SET check_out = ?, check_out_lat = ?, check_out_lng = ?, checkout_status = 'unscheduled'
                            WHERE id = ?
                        `).run(
                            effectiveCheckOutISO, 
                            activeUnscheduled.check_in_lat, 
                            activeUnscheduled.check_in_lng, 
                            activeUnscheduled.id
                        );

                        // End the active step_away interruption if any
                        db.prepare(`
                            UPDATE shift_interruptions
                            SET end_time = ?
                            WHERE attendance_id = ? AND type = 'step_away' AND end_time IS NULL
                        `).run(effectiveCheckOutISO, activeUnscheduled.id);

                        // Insert overtime request for the completed unscheduled shift duration
                        const otMins = getDifferenceInMinutes(activeUnscheduled.check_in, effectiveCheckOutISO);
                        if (otMins > 0) {
                            insertOvertimeRequest(uid, activeUnscheduled.id, 'Unscheduled Check-in (Auto-Close)', otMins);
                        }
                    }

                    recalculateUserDailyAttendance(uid, activeUnscheduled.date);
                } else {
                    // Find next scheduled shift that is active right now
                    const activeShift = db.prepare(`
                        SELECT * FROM shift_instances
                        WHERE user_id = ? AND status = 'Scheduled' AND start_time <= ? AND end_time > ?
                        ORDER BY start_time ASC
                        LIMIT 1
                    `).get(uid, now, now) as any;

                    if (activeShift) {
                        logger.debug('[evaluateUserAttendance] activeShift Branch Entry. Flowing unscheduled to scheduled.');

                        const otMinutes = getDifferenceInMinutes(activeUnscheduled.check_in, activeShift.start_time);
                        const minUnscheduledSessionMins = settings?.min_unscheduled_session_minutes !== undefined ? settings.min_unscheduled_session_minutes : 5;

                        if (otMinutes >= minUnscheduledSessionMins) {
                            if (otMinutes > 0) {
                                insertOvertimeRequest(uid, activeUnscheduled.id, 'Early Clock-in (Auto-Slice)', otMinutes);
                            }

                            // Update unscheduled to end at shift start time
                            db.prepare(`
                                UPDATE attendance SET check_out = ?, check_out_lat = ?, check_out_lng = ?, checkout_status = 'unscheduled' WHERE id = ?
                            `).run(activeShift.start_time, activeUnscheduled.check_in_lat, activeUnscheduled.check_in_lng, activeUnscheduled.id);

                            // Insert new active attendance record for the scheduled shift
                            db.prepare(`
                                INSERT INTO attendance (user_id, check_in, check_out, date, check_in_lat, check_in_lng, checkin_status, checkout_status, working_status, shift_id)
                                VALUES (?, ?, NULL, ?, ?, ?, 'on_time', NULL, 'working', ?)
                            `).run(uid, activeShift.start_time, activeShift.logical_date, activeUnscheduled.check_in_lat, activeUnscheduled.check_in_lng, activeShift.id.toString());
                        } else {
                            // Early check-in was shorter than the minimum unscheduled session limit
                            db.prepare('DELETE FROM requests WHERE attendance_id = ?').run(activeUnscheduled.id);
                            db.prepare('DELETE FROM shift_interruptions WHERE attendance_id = ?').run(activeUnscheduled.id);
                            db.prepare('DELETE FROM attendance WHERE id = ?').run(activeUnscheduled.id);

                            // Insert new active attendance record for the scheduled shift starting at shift start
                            db.prepare(`
                                INSERT INTO attendance (user_id, check_in, check_out, date, check_in_lat, check_in_lng, checkin_status, checkout_status, working_status, shift_id)
                                VALUES (?, ?, NULL, ?, ?, ?, 'on_time', NULL, 'working', ?)
                            `).run(uid, activeShift.start_time, activeShift.logical_date, activeUnscheduled.check_in_lat, activeUnscheduled.check_in_lng, activeShift.id.toString());

                            logger.info(`Auto-slice early segment ignored for User ${uid}: duration is ${otMinutes} mins (minimum required unscheduled: ${minUnscheduledSessionMins} mins).`);
                        }

                        recalculateUserDailyAttendance(uid, activeUnscheduled.date);
                    }
                }
            }

            // Scenario C: JIT Early Leave Evaluation (Only after shift end_time has passed)
            const earlyLeaveSessions = db.prepare(`
                SELECT a.*, s.end_time as scheduled_end_time, s.id as shift_instance_id
                FROM attendance a
                JOIN shift_instances s ON a.shift_id = s.id
                LEFT JOIN requests r ON r.attendance_id = a.id AND r.type = 'early_leave_approval'
                WHERE a.user_id = ? AND a.check_out IS NOT NULL AND s.status != 'Cancelled'
                  AND s.end_time <= ? AND r.id IS NULL
            `).all(uid, now) as any[];

            earlyLeaveSessions.forEach(session => {
                const checkOutTime = new Date(session.check_out);
                const shiftEnd = new Date(session.scheduled_end_time);
                if (checkOutTime < shiftEnd) {
                    const earlyMinutes = getDifferenceInMinutes(checkOutTime, shiftEnd);
                    if (earlyMinutes > gracePeriod) {
                        insertLateInOrEarlyLeaveRequest(
                            uid,
                            session.id,
                            'early_leave_approval',
                            `System detected early leave by ${earlyMinutes} minutes.`,
                            earlyMinutes
                        );
                    }
                }
            });

            // Cleanup Abandoned Shifts (MUST BE LAST)
            db.prepare(`
                UPDATE shift_instances
                SET status = 'Cancelled'
                WHERE user_id = ? AND status = 'Scheduled' AND end_time <= ?
            `).run(uid, now);
        });

        evaluate(userId);
        logger.debug('[evaluateUserAttendance] Transaction Exit');
    } catch (error) {
        logger.error(`Error evaluating attendance for user ${userId}:`, error);
    }
};
