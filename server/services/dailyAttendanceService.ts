import db from '../db/index.js';
import logger from '../utils/logger.js';
import { getDifferenceInMinutes } from '../utils/timeManager.js';

export const generateDailyAttendance = (targetDate: string): void => {
    logger.info(`Starting daily attendance generation for ${targetDate}`);
    
    // Fetch all employees and managers
    const users = db.prepare("SELECT id FROM users WHERE role IN ('employee', 'manager')").all() as any[];
    
    const generateTransaction = db.transaction(() => {
        for (const user of users) {
            const uid = user.id;
            
            let scheduled_working_minutes = 0;
            let scheduled_non_working_minutes = 0;
            let unscheduled_working_minutes = 0;
            let deduction_minutes = 0;

            // --- 1. Calculate Scheduled Working Periods ---
            // Attendance where status != 'unscheduled'
            const scheduledLogs = db.prepare(`
                SELECT a.*,
                  s.start_time as shift_start, s.end_time as shift_end
                FROM attendance a
                LEFT JOIN shift_instances s ON a.shift_id = s.id
                WHERE a.user_id = ? AND a.date = ? AND a.checkin_status != 'unscheduled' AND a.check_out IS NOT NULL
            `).all(uid, targetDate) as any[];

            for (const log of scheduledLogs) {
                let workedMin = getDifferenceInMinutes(log.check_in, log.check_out);
                
                // Subtract shift interruptions
                const interruptions = db.prepare(`
                    SELECT start_time, end_time FROM shift_interruptions 
                    WHERE attendance_id = ? AND end_time IS NOT NULL
                `).all(log.id) as any[];
                
                for (const inter of interruptions) {
                    workedMin -= getDifferenceInMinutes(inter.start_time, inter.end_time);
                }
                
                scheduled_working_minutes += Math.max(0, workedMin);
            }

            // --- 2. Calculate Scheduled Non-Working Periods ---
            // Calculate exact approved paid requests for the day
            // These could be 'permission_to_leave', 'early_leave_approval', etc.
            const approvedRequests = db.prepare(`
                SELECT SUM(paid_minutes) as total_paid
                FROM requests r
                LEFT JOIN attendance a ON r.attendance_id = a.id
                WHERE r.user_id = ? AND r.status = 'approved' AND r.type != 'overtime_approval'
                AND (a.date = ? OR (r.attendance_id IS NULL AND DATE(r.created_at) = ?))
            `).get(uid, targetDate, targetDate) as any;
            
            const approvedPaidMin = approvedRequests?.total_paid || 0;
            scheduled_non_working_minutes += approvedPaidMin;

            // --- 4. Calculate Deduction Periods ---
            // We find expected total scheduled minutes for the day.
            const allShifts = db.prepare(`
                SELECT start_time, end_time FROM shift_instances
                WHERE user_id = ? AND logical_date = ?
            `).all(uid, targetDate) as any[];
            
            let totalExpectedMinutes = 0;
            for (const s of allShifts) {
                totalExpectedMinutes += getDifferenceInMinutes(s.start_time, s.end_time);
            }

            // Missing time is what was expected minus what was worked
            let missingMinutes = totalExpectedMinutes - scheduled_working_minutes;
            
            // Deductions = missing time - approved paid time
            // The user explicitly stated: "just lose the 30 min", no multiplier.
            deduction_minutes = Math.max(0, missingMinutes - scheduled_non_working_minutes);

            // --- 3. Calculate Unscheduled Working Periods (Overtime) ---
            const unscheduledLogs = db.prepare(`
                SELECT id FROM attendance
                WHERE user_id = ? AND date = ? AND checkin_status = 'unscheduled'
            `).all(uid, targetDate) as any[];

            // Only count approved overtime
            const placeholders = unscheduledLogs.length > 0 ? unscheduledLogs.map(() => '?').join(',') : null;
            if (placeholders) {
                const logIds = unscheduledLogs.map(l => l.id);
                // Also get explicit overtime_approval requests
                const approvedOT = db.prepare(`
                    SELECT SUM(paid_minutes) as total_ot
                    FROM requests
                    WHERE user_id = ? AND status = 'approved' AND type = 'overtime_approval' AND attendance_id IN (${placeholders})
                `).get(uid, ...logIds) as any;
                unscheduled_working_minutes += (approvedOT?.total_ot || 0);
            }
            
            // There might be overtime requests NOT linked to an unscheduled log (e.g. slicing early clock-in)
            const scheduledLogIds = scheduledLogs.map(l => l.id);
            if (scheduledLogIds.length > 0) {
                const schPlaceholders = scheduledLogIds.map(() => '?').join(',');
                const approvedOTSch = db.prepare(`
                    SELECT SUM(paid_minutes) as total_ot
                    FROM requests
                    WHERE user_id = ? AND status = 'approved' AND type = 'overtime_approval' AND attendance_id IN (${schPlaceholders})
                `).get(uid, ...scheduledLogIds) as any;
                unscheduled_working_minutes += (approvedOTSch?.total_ot || 0);
            }

            // Upsert into daily_attendance
            db.prepare(`
                INSERT INTO daily_attendance (
                    user_id, date, scheduled_working_minutes, scheduled_non_working_minutes,
                    unscheduled_working_minutes, deduction_minutes, status
                ) VALUES (?, ?, ?, ?, ?, ?, 'processed')
                ON CONFLICT(user_id, date) DO UPDATE SET
                    scheduled_working_minutes = excluded.scheduled_working_minutes,
                    scheduled_non_working_minutes = excluded.scheduled_non_working_minutes,
                    unscheduled_working_minutes = excluded.unscheduled_working_minutes,
                    deduction_minutes = excluded.deduction_minutes,
                    status = excluded.status,
                    updated_at = CURRENT_TIMESTAMP
            `).run(
                uid, targetDate, 
                scheduled_working_minutes, scheduled_non_working_minutes, 
                unscheduled_working_minutes, deduction_minutes
            );
        }
    });

    try {
        generateTransaction();
        logger.info(`Successfully generated daily attendance for ${targetDate}`);
    } catch (error) {
        logger.error(`Failed to generate daily attendance for ${targetDate}:`, error);
    }
};
