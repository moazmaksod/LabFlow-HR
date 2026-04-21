import * as fs from 'fs';

const file = 'server/services/attendanceEvaluationService.ts';
let content = fs.readFileSync(file, 'utf8');

// To fix the ping-pong loop:
// 1. Scenario A: The `nextShift` we flow into MUST NOT already be over. We should only transition into a shift if \`end_time > now\`.
//    If a shift is entirely in the past (both start and end <= now) and the user wasn't clocked in for it, it should probably be marked 'Missed' or ignored.
// 2. We can add a cleanup step at the beginning of the transaction to mark completely missed shifts as 'Missed'.

const newCode = `import db from '../db/index.js';

export const evaluateUserAttendance = (userId: number, timezone: string): void => {
    try {
        const evaluate = db.transaction((uid: number) => {
            const now = new Date().toISOString();

            // PRE-STEP: Clean up any old, completely missed shifts so they don't cause ghost evaluations.
            db.prepare(\`
                UPDATE shift_instances
                SET status = 'Missed'
                WHERE user_id = ? AND status = 'Scheduled' AND end_time <= ?
            \`).run(uid, now);

            // Scenario A: Unscheduled Early Check-in flowing into a Scheduled Shift
            const activeUnscheduled = db.prepare(\`
                SELECT a.*
                FROM attendance a
                WHERE a.user_id = ? AND a.check_out IS NULL
                  AND (a.status = 'unscheduled' OR a.shift_id IS NULL)
                LIMIT 1
            \`).get(uid) as any;

            if (activeUnscheduled) {
                // Find next scheduled shift that has STARTED but NOT ENDED
                const nextShift = db.prepare(\`
                    SELECT * FROM shift_instances
                    WHERE user_id = ? AND status = 'Scheduled' AND start_time <= ? AND end_time > ?
                    ORDER BY start_time ASC
                    LIMIT 1
                \`).get(uid, now, now) as any;

                if (nextShift) {
                    // Update unscheduled to end at shift start time
                    db.prepare(\`
                        UPDATE attendance SET check_out = ? WHERE id = ?
                    \`).run(nextShift.start_time, activeUnscheduled.id);

                    // Insert new active attendance record for the scheduled shift
                    db.prepare(\`
                        INSERT INTO attendance (user_id, check_in, check_out, date, status, current_status, shift_id)
                        VALUES (?, ?, NULL, ?, 'on_time', 'working', ?)
                    \`).run(uid, nextShift.start_time, nextShift.logical_date, nextShift.id.toString());
                }
            }

            // Scenario B: Scheduled Shift extending into Overtime
            // Because of the Pre-Step, any shift that triggers Scenario B will only be one that is CURRENTLY
            // attached to an ACTIVE attendance record but whose scheduled end_time has just passed.
            const activeScheduled = db.prepare(\`
                SELECT a.*, s.end_time as scheduled_end_time, s.id as shift_instance_id
                FROM attendance a
                JOIN shift_instances s ON a.shift_id = s.id
                WHERE a.user_id = ? AND a.check_out IS NULL AND s.status = 'Scheduled'
                  AND s.end_time <= ?
                LIMIT 1
            \`).get(uid, now) as any;

            if (activeScheduled) {
                // End scheduled attendance
                db.prepare(\`
                    UPDATE attendance SET check_out = ? WHERE id = ?
                \`).run(activeScheduled.scheduled_end_time, activeScheduled.id);

                const unscheduledShiftId = \\\`unscheduled_\${activeScheduled.date.replace(/-/g, '')}_\${Date.now()}\\\`;

                // Insert new active unscheduled attendance
                db.prepare(\`
                    INSERT INTO attendance (user_id, check_in, check_out, date, status, current_status, shift_id)
                    VALUES (?, ?, NULL, ?, 'unscheduled', 'working', ?)
                \`).run(uid, activeScheduled.scheduled_end_time, activeScheduled.date, unscheduledShiftId);

                // Update shift instance status
                db.prepare(\`
                    UPDATE shift_instances SET status = 'Completed' WHERE id = ?
                \`).run(activeScheduled.shift_instance_id);
            }
        });

        evaluate(userId);
    } catch (error) {
        console.error(\`Error evaluating attendance for user \${userId}:\`, error);
        // We catch here so the controller continues responding, as this is background evaluation
    }
};
`;

fs.writeFileSync(file, newCode, 'utf8');
