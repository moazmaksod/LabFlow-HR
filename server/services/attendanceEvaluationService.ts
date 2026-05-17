import db from '../db/index.js';
import logger from '../utils/logger.js';
import { getAppNow } from "../utils/timeManager.js";

export const evaluateUserAttendance = (userId: number, timezone: string): void => {
    logger.debug('[evaluateUserAttendance] Entry: userId=', userId, 'timezone=', timezone);
    try {
        const evaluate = db.transaction((uid: number) => {
            logger.debug('[evaluateUserAttendance] Transaction Entry: uid=', uid);
            const now = getAppNow();
            logger.debug('[evaluateUserAttendance] now=', now);

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
                // Check if this is the final shift of the day
                const futureShiftsToday = db.prepare(`
                    SELECT id FROM shift_instances
                    WHERE user_id = ? AND logical_date = ? AND start_time >= ? AND status = 'Scheduled'
                    LIMIT 1
                `).get(uid, activeScheduled.logical_date, activeScheduled.scheduled_end_time) as any;
                const isFinalShift = !futureShiftsToday;

                if (activeScheduled.current_status === 'away' && isFinalShift) {
                    logger.debug('[evaluateUserAttendance] activeScheduled is final shift and away. Auto-terminating break.');
                    // Auto-Terminate Stepaway and Clock-out
                    db.prepare(`
                        UPDATE attendance SET check_out = ? WHERE id = ?
                    `).run(activeScheduled.scheduled_end_time, activeScheduled.id);

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
                        UPDATE attendance SET check_out = ? WHERE id = ?
                    `).run(activeScheduled.scheduled_end_time, activeScheduled.id);

                    const unscheduledShiftId = `unscheduled_${activeScheduled.date.replace(/-/g, '')}_${new Date(getAppNow()).getTime()}`;

                    // Insert new active unscheduled attendance
                    db.prepare(`
                        INSERT INTO attendance (user_id, check_in, check_out, date, status, current_status, shift_id)
                        VALUES (?, ?, NULL, ?, 'unscheduled', 'working', ?)
                    `).run(uid, activeScheduled.scheduled_end_time, activeScheduled.date, unscheduledShiftId);

                    // Update shift instance status
                    db.prepare(`
                        UPDATE shift_instances SET status = 'Completed' WHERE id = ?
                    `).run(activeScheduled.shift_instance_id);
                }
            }

            // Scenario A: Unscheduled Early Check-in flowing into a Scheduled Shift
            const activeUnscheduled = db.prepare(`
                SELECT a.*
                FROM attendance a
                WHERE a.user_id = ? AND a.check_out IS NULL
                  AND (a.status = 'unscheduled' OR a.shift_id IS NULL)
                LIMIT 1
            `).get(uid) as any;

            if (activeUnscheduled) {
                logger.debug('[evaluateUserAttendance] activeUnscheduled Branch Entry');
                // Find next scheduled shift that is active right now
                const activeShift = db.prepare(`
                    SELECT * FROM shift_instances
                    WHERE user_id = ? AND status = 'Scheduled' AND start_time <= ? AND end_time > ?
                    ORDER BY start_time ASC
                    LIMIT 1
                `).get(uid, now, now) as any;

                if (activeShift) {
                    logger.debug('[evaluateUserAttendance] activeShift Branch Entry. Flowing unscheduled to scheduled.');

                    const checkInMs = new Date(activeUnscheduled.check_in).getTime();
                    const shiftStartMs = new Date(activeShift.start_time).getTime();
                    const otMinutes = Math.floor((shiftStartMs - checkInMs) / 60000);

                    if (otMinutes > 0) {
                        db.prepare(`
                            INSERT INTO requests (user_id, attendance_id, type, reference_id, reason, details, status)
                            VALUES (?, ?, 'overtime_approval', ?, 'Early Clock-in (Auto-Slice)', ?, 'pending')
                        `).run(uid, activeUnscheduled.id, activeUnscheduled.id, JSON.stringify({ raw_overtime_minutes: otMinutes, requested_overtime_minutes: otMinutes }));
                    }

                    // Update unscheduled to end at shift start time
                    db.prepare(`
                        UPDATE attendance SET check_out = ? WHERE id = ?
                    `).run(activeShift.start_time, activeUnscheduled.id);

                    // Insert new active attendance record for the scheduled shift
                    db.prepare(`
                        INSERT INTO attendance (user_id, check_in, check_out, date, status, current_status, shift_id)
                        VALUES (?, ?, NULL, ?, 'on_time', 'working', ?)
                    `).run(uid, activeShift.start_time, activeShift.logical_date, activeShift.id.toString());
                }
            }

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
