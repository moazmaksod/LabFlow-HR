import db from '../db/index.js';

export const evaluateUserAttendance = (userId: number, timezone: string): void => {
    try {
        const evaluate = db.transaction((uid: number) => {
            const now = new Date().toISOString();

            // Scenario B: Scheduled Shift extending into Overtime
            const activeScheduled = db.prepare(`
                SELECT a.*, s.end_time as scheduled_end_time, s.id as shift_instance_id
                FROM attendance a
                JOIN shift_instances s ON a.shift_id = s.id
                WHERE a.user_id = ? AND a.check_out IS NULL AND s.status = 'Scheduled'
                  AND s.end_time <= ?
                LIMIT 1
            `).get(uid, now) as any;

            if (activeScheduled) {
                // End scheduled attendance
                db.prepare(`
                    UPDATE attendance SET check_out = ? WHERE id = ?
                `).run(activeScheduled.scheduled_end_time, activeScheduled.id);

                const unscheduledShiftId = `unscheduled_${activeScheduled.date.replace(/-/g, '')}_${Date.now()}`;

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

            // Scenario A: Unscheduled Early Check-in flowing into a Scheduled Shift
            const activeUnscheduled = db.prepare(`
                SELECT a.*
                FROM attendance a
                WHERE a.user_id = ? AND a.check_out IS NULL
                  AND (a.status = 'unscheduled' OR a.shift_id IS NULL)
                LIMIT 1
            `).get(uid) as any;

            if (activeUnscheduled) {
                // Find next scheduled shift that is active right now
                const activeShift = db.prepare(`
                    SELECT * FROM shift_instances
                    WHERE user_id = ? AND status = 'Scheduled' AND start_time <= ? AND end_time > ?
                    ORDER BY start_time ASC
                    LIMIT 1
                `).get(uid, now, now) as any;

                if (activeShift) {
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
    } catch (error) {
        console.error(`Error evaluating attendance for user ${userId}:`, error);
    }
};
