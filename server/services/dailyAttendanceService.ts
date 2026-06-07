import db from '../db/index.js';
import logger from '../utils/logger.js';
import { getDifferenceInMinutes } from '../utils/timeManager.js';

export const recalculateUserDailyAttendance = (userId: number, targetDate: string): void => {
    let scheduled_working_minutes = 0;
    let scheduled_non_working_minutes = 0;
    let unscheduled_working_minutes = 0;
    let deduction_minutes = 0;

    // --- 1. Calculate Scheduled Working Periods ---
    // Attendance where status != 'unscheduled'
    const scheduledLogs = db.prepare(`
        SELECT a.*
        FROM attendance a
        WHERE a.user_id = ? AND a.date = ? AND a.checkin_status != 'unscheduled' AND a.check_out IS NOT NULL
    `).all(userId, targetDate) as any[];

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

    // --- 2. Calculate Scheduled Non-Working Periods (Approved Only) ---
    const approvedRequests = db.prepare(`
        SELECT SUM(r.paid_minutes) as total_paid
        FROM requests r
        LEFT JOIN attendance a ON r.attendance_id = a.id
        WHERE r.user_id = ? 
          AND r.status = 'approved'
          AND r.type IN ('permission_to_leave', 'late_in_approval', 'early_leave_approval', 'shift_interruption_review')
          AND (
              a.date = ? 
              OR (r.attendance_id IS NULL AND (substr(r.requested_check_in, 1, 10) = ? OR (r.requested_check_in IS NULL AND substr(r.created_at, 1, 10) = ?)))
          )
    `).get(userId, targetDate, targetDate, targetDate) as any;
    
    scheduled_non_working_minutes = approvedRequests?.total_paid || 0;

    // --- 3. Calculate Unscheduled Working Periods (Approved Overtime Only) ---
    const approvedOT = db.prepare(`
        SELECT SUM(r.paid_minutes) as total_ot
        FROM requests r
        LEFT JOIN attendance a ON r.attendance_id = a.id
        WHERE r.user_id = ? 
          AND r.status = 'approved'
          AND r.type = 'overtime_approval'
          AND (
              a.date = ? 
              OR (r.attendance_id IS NULL AND (substr(r.requested_check_in, 1, 10) = ? OR (r.requested_check_in IS NULL AND substr(r.created_at, 1, 10) = ?)))
          )
    `).get(userId, targetDate, targetDate, targetDate) as any;

    unscheduled_working_minutes = approvedOT?.total_ot || 0;

    // --- 4. Calculate Deduction Periods (Admin Penalty from Rejected Requests) ---
    const rejectedRequests = db.prepare(`
        SELECT SUM(r.penalty_minutes) as total_penalty
        FROM requests r
        LEFT JOIN attendance a ON r.attendance_id = a.id
        WHERE r.user_id = ? 
          AND r.status = 'rejected'
          AND (
              a.date = ? 
              OR (r.attendance_id IS NULL AND (substr(r.requested_check_in, 1, 10) = ? OR (r.requested_check_in IS NULL AND substr(r.created_at, 1, 10) = ?)))
          )
    `).get(userId, targetDate, targetDate, targetDate) as any;

    deduction_minutes = rejectedRequests?.total_penalty || 0;

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
        userId, targetDate, 
        scheduled_working_minutes, scheduled_non_working_minutes, 
        unscheduled_working_minutes, deduction_minutes
    );
};

export const generateDailyAttendance = (targetDate: string): void => {
    logger.info(`Starting daily attendance generation for ${targetDate}`);
    
    // Fetch all employees and managers
    const users = db.prepare("SELECT id FROM users WHERE role IN ('employee', 'manager')").all() as any[];
    
    const generateTransaction = db.transaction(() => {
        for (const user of users) {
            try {
                recalculateUserDailyAttendance(user.id, targetDate);
            } catch (error) {
                logger.error(`Failed to generate daily attendance for user ${user.id} on ${targetDate}:`, error);
            }
        }
    });

    try {
        generateTransaction();
        logger.info(`Successfully generated daily attendance for ${targetDate}`);
    } catch (error) {
        logger.error(`Failed to generate daily attendance for ${targetDate}:`, error);
    }
};
