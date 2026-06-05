import { Request, Response } from 'express';
import db from '../db/index.js';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import { logAudit } from '../services/auditService.js';
import logger from '../utils/logger.js';
import { generateDailyAttendance, recalculateUserDailyAttendance } from '../services/dailyAttendanceService.js';
import { getDifferenceInMinutes } from '../utils/timeManager.js';

export const recalculateDailyAttendance = (req: Request, res: Response): void => {
    try {
        const { date } = req.body;
        if (!date) {
            res.status(400).json({ error: 'Missing required parameter: date' });
            return;
        }
        generateDailyAttendance(date);
        res.json({ message: `Successfully recalculated daily attendance for ${date}` });
    } catch (error) {
        logger.error('Error in recalculateDailyAttendance:', error);
        res.status(500).json({ error: 'Failed to recalculate daily attendance' });
    }
};

const calculateUserPayroll = (user: any, start_date: string, end_date: string) => {
    // Check if there is an existing payment record in the payrolls ledger
    const existingPayment = db.prepare(`
        SELECT p.*, u.name as paid_by_name
        FROM payrolls p
        LEFT JOIN users u ON p.paid_by = u.id
        WHERE p.user_id = ? AND p.start_date = ? AND p.end_date = ? AND p.status = 'paid'
    `).get(user.id, start_date, end_date) as any;

    const settings = db.prepare('SELECT overtime_rate_percent FROM settings WHERE id = 1').get() as any;
    const currentOvertimeRatePercent = settings?.overtime_rate_percent || 150;

    let hourly_rate = user.hourly_rate || 0;
    let scheduled_working_minutes = 0;
    let scheduled_non_working_minutes = 0;
    let overtime_minutes = 0;
    let overtime_rate_percent = currentOvertimeRatePercent;
    let deduction_minutes = 0;
    let attendance_bonus = 0.0;
    let net_salary = 0;
    let status = 'unpaid';
    let paid_by_name = null;
    let paid_at = null;

    if (existingPayment) {
        hourly_rate = existingPayment.hourly_rate;
        scheduled_working_minutes = existingPayment.scheduled_working_minutes;
        scheduled_non_working_minutes = existingPayment.scheduled_non_working_minutes;
        overtime_minutes = existingPayment.overtime_minutes;
        overtime_rate_percent = existingPayment.overtime_rate_percent;
        deduction_minutes = existingPayment.deduction_minutes;
        attendance_bonus = existingPayment.attendance_bonus || 0.0;
        net_salary = existingPayment.net_salary;
        status = 'paid';
        paid_by_name = existingPayment.paid_by_name || 'System';
        paid_at = existingPayment.created_at;
    } else {
        const dailyRecords = db.prepare(`
            SELECT * FROM daily_attendance 
            WHERE user_id = ? AND date BETWEEN ? AND ?
        `).all(user.id, start_date, end_date) as any[];

        for (const record of dailyRecords) {
            scheduled_working_minutes += record.scheduled_working_minutes;
            scheduled_non_working_minutes += record.scheduled_non_working_minutes;
            overtime_minutes += record.unscheduled_working_minutes;
            deduction_minutes += record.deduction_minutes;
        }

        const totalPaidMinutes = scheduled_working_minutes + scheduled_non_working_minutes;
        const basePay = (totalPaidMinutes / 60) * hourly_rate;
        const overtimePay = (overtime_minutes / 60) * (hourly_rate * (overtime_rate_percent / 100));
        const deductionAmount = (deduction_minutes / 60) * hourly_rate;
        
        net_salary = basePay + overtimePay - deductionAmount;

        // Calculate Attendance Bonus
        const shifts = db.prepare(`
            SELECT * FROM shift_instances 
            WHERE user_id = ? AND logical_date BETWEEN ? AND ? AND status != 'Cancelled'
        `).all(user.id, start_date, end_date) as any[];

        let allOnTime = shifts.length > 0;
        for (const shift of shifts) {
            const att = db.prepare("SELECT * FROM attendance WHERE user_id = ? AND shift_id = ?").get(user.id, shift.id.toString()) as any;
            if (!att || att.checkin_status !== 'on_time' || att.checkout_status !== 'on_time') {
                allOnTime = false;
                break;
            }
        }

        const settingsRow = db.prepare('SELECT attendance_bonus_amount FROM settings WHERE id = 1').get() as any;
        const attendanceBonusPercent = settingsRow?.attendance_bonus_amount || 0.0;
        attendance_bonus = allOnTime ? net_salary * (attendanceBonusPercent / 100) : 0.0;
        net_salary += attendance_bonus;
    }

    const base_salary = ((scheduled_working_minutes + scheduled_non_working_minutes) / 60) * hourly_rate;
    const total_additions = (overtime_minutes / 60) * (hourly_rate * (overtime_rate_percent / 100));
    const total_deductions = (deduction_minutes / 60) * hourly_rate;

    // Fetch count of pending requests for this user in this range or related to calculated shifts
    const pendingRequests = db.prepare(`
        SELECT COUNT(*) as count 
        FROM requests r
        LEFT JOIN attendance a ON r.attendance_id = a.id
        WHERE r.user_id = ? AND r.status = 'pending'
          AND (
              (r.attendance_id IS NOT NULL AND a.date BETWEEN ? AND ?)
              OR
              (r.attendance_id IS NULL AND (substr(r.requested_check_in, 1, 10) BETWEEN ? AND ? OR (r.requested_check_in IS NULL AND substr(r.created_at, 1, 10) BETWEEN ? AND ?)))
          )
    `).get(user.id, start_date, end_date, start_date, end_date, start_date, end_date) as any;

    return {
        user_id: user.id,
        user_name: user.name,
        job_title: user.job_title || 'No Job',
        hourly_rate: Number(hourly_rate.toFixed(2)),
        overtime_rate_percent,
        scheduled_working_minutes,
        scheduled_non_working_minutes,
        overtime_minutes,
        deduction_minutes,
        attendance_bonus: Number(attendance_bonus.toFixed(2)),
        base_salary: Number(base_salary.toFixed(2)),
        total_additions: Number(total_additions.toFixed(2)),
        total_deductions: Number(total_deductions.toFixed(2)),
        net_salary: Number(net_salary.toFixed(2)),
        status,
        paid_by_name,
        paid_at,
        pending_requests_count: pendingRequests?.count || 0
    };
};

export const getPayrollSummary = (req: Request, res: Response): void => {
    try {
        const { user_id, start_date, end_date } = req.query;

        if (!user_id || !start_date || !end_date) {
            res.status(400).json({ error: 'Missing required parameters: user_id, start_date, end_date' });
            return;
        }

        const user = db.prepare(`
            SELECT u.id, u.name, p.hourly_rate, j.title as job_title
            FROM users u
            JOIN profiles p ON u.id = p.user_id
            LEFT JOIN jobs j ON p.job_id = j.id
            WHERE u.id = ?
        `).get(user_id) as any;

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const summary = calculateUserPayroll(user, start_date as string, end_date as string);
        res.json({
            period: { start: start_date, end: end_date },
            user: { id: user.id, name: user.name, hourly_rate: user.hourly_rate },
            time_metrics: {
                actual_worked_hours: Number(((summary.scheduled_working_minutes + summary.overtime_minutes) / 60).toFixed(2))
            },
            financial_metrics: {
                final_net_salary: summary.net_salary
            }
        });

    } catch (error) {
        logger.error('Error in getPayrollSummary:', error);
        res.status(500).json({ error: 'Failed to fetch payroll summary' });
    }
};

export const getAllPayroll = (req: Request, res: Response): void => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            res.status(400).json({ error: 'Missing required parameters: startDate, endDate' });
            return;
        }

        // Regenerate daily attendance on-the-fly for any of yesterday, today, or tomorrow falling in the query range
        const todayStr = new Date().toISOString().split('T')[0];
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
        const tomorrowDate = new Date();
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

        if (startDate <= todayStr && endDate >= todayStr) {
            generateDailyAttendance(todayStr);
        }
        if (startDate <= yesterdayStr && endDate >= yesterdayStr) {
            generateDailyAttendance(yesterdayStr);
        }
        if (startDate <= tomorrowStr && endDate >= tomorrowStr) {
            generateDailyAttendance(tomorrowStr);
        }

        const users = db.prepare(`
            SELECT u.id, u.name, p.hourly_rate, j.title as job_title
            FROM users u
            JOIN profiles p ON u.id = p.user_id
            LEFT JOIN jobs j ON p.job_id = j.id
            WHERE u.role = 'employee'
        `).all() as any[];

        if (users.length === 0) {
            res.json([]);
            return;
        }

        const results = users.map(user => {
            const summary = calculateUserPayroll(user, startDate as string, endDate as string);
            return {
                id: summary.user_id, // For key indexing on UI
                user_id: summary.user_id,
                user_name: summary.user_name,
                job_title: summary.job_title,
                hourly_rate: summary.hourly_rate,
                scheduled_working_minutes: summary.scheduled_working_minutes,
                scheduled_non_working_minutes: summary.scheduled_non_working_minutes,
                overtime_minutes: summary.overtime_minutes,
                deduction_minutes: summary.deduction_minutes,
                base_salary: summary.base_salary,
                total_additions: summary.total_additions,
                total_deductions: summary.total_deductions,
                attendance_bonus: summary.attendance_bonus,
                total_hours: Number(((summary.scheduled_working_minutes + summary.overtime_minutes) / 60).toFixed(2)),
                total_pay: summary.net_salary,
                net_salary: summary.net_salary,
                status: summary.status,
                paid_by_name: summary.paid_by_name,
                paid_at: summary.paid_at,
                pending_requests_count: summary.pending_requests_count
            };
        });

        res.json(results);

    } catch (error) {
        logger.error('Error calculating all payroll:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getPayrollDetails = (req: Request, res: Response): void => {
    try {
        const { user_id } = req.params;
        const { startDate, endDate } = req.query;

        if (!user_id || !startDate || !endDate) {
            res.status(400).json({ error: 'Missing required parameters: user_id, startDate, endDate' });
            return;
        }

        // Regenerate daily attendance on-the-fly for any of yesterday, today, or tomorrow falling in the query range
        const todayStr = new Date().toISOString().split('T')[0];
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
        const tomorrowDate = new Date();
        tomorrowDate.setDate(tomorrowDate.getDate() + 1);
        const tomorrowStr = tomorrowDate.toISOString().split('T')[0];

        if (startDate <= todayStr && endDate >= todayStr) {
            generateDailyAttendance(todayStr);
        }
        if (startDate <= yesterdayStr && endDate >= yesterdayStr) {
            generateDailyAttendance(yesterdayStr);
        }
        if (startDate <= tomorrowStr && endDate >= tomorrowStr) {
            generateDailyAttendance(tomorrowStr);
        }

        const user = db.prepare(`
            SELECT u.id, u.name, p.hourly_rate, j.title as job_title
            FROM users u
            JOIN profiles p ON u.id = p.user_id
            LEFT JOIN jobs j ON p.job_id = j.id
            WHERE u.id = ?
        `).get(user_id) as any;

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const summary = calculateUserPayroll(user, startDate as string, endDate as string);

        // Fetch daily records
        const dailyRecords = db.prepare(`
            SELECT * FROM daily_attendance
            WHERE user_id = ? AND date BETWEEN ? AND ?
            ORDER BY date ASC
        `).all(user_id, startDate, endDate) as any[];

        // Fetch pending requests
        const pendingRequests = db.prepare(`
            SELECT r.*, a.date as attendance_date
            FROM requests r
            LEFT JOIN attendance a ON r.attendance_id = a.id
            WHERE r.user_id = ? AND r.status = 'pending'
              AND (
                  (r.attendance_id IS NOT NULL AND a.date BETWEEN ? AND ?)
                  OR
                  (r.attendance_id IS NULL AND (substr(r.requested_check_in, 1, 10) BETWEEN ? AND ? OR (r.requested_check_in IS NULL AND substr(r.created_at, 1, 10) BETWEEN ? AND ?)))
              )
            ORDER BY r.created_at DESC
        `).all(user_id, startDate, endDate, startDate, endDate, startDate, endDate) as any[];

        // Fetch processed requests
        const processedRequests = db.prepare(`
            SELECT r.*, a.date as attendance_date
            FROM requests r
            LEFT JOIN attendance a ON r.attendance_id = a.id
            WHERE r.user_id = ? AND r.status != 'pending'
              AND (
                  (r.attendance_id IS NOT NULL AND a.date BETWEEN ? AND ?)
                  OR
                  (r.attendance_id IS NULL AND (substr(r.requested_check_in, 1, 10) BETWEEN ? AND ? OR (r.requested_check_in IS NULL AND substr(r.created_at, 1, 10) BETWEEN ? AND ?)))
              )
            ORDER BY r.created_at DESC
        `).all(user_id, startDate, endDate, startDate, endDate, startDate, endDate) as any[];

        // Calculate Missed Shifts
        const shifts = db.prepare(`
            SELECT * FROM shift_instances
            WHERE user_id = ? AND logical_date BETWEEN ? AND ? AND status != 'Cancelled'
        `).all(user_id, startDate, endDate) as any[];

        const missedShifts: any[] = [];
        const nowStr = new Date().toISOString();
        for (const shift of shifts) {
            const hasAttendance = db.prepare(`
                SELECT id FROM attendance
                WHERE user_id = ? AND shift_id = ?
            `).get(user_id, shift.id.toString());

            if (!hasAttendance) {
                if (new Date(shift.end_time) < new Date(nowStr)) {
                    const duration = getDifferenceInMinutes(shift.start_time, shift.end_time);
                    missedShifts.push({
                        id: shift.id,
                        date: shift.logical_date,
                        start_time: shift.start_time,
                        end_time: shift.end_time,
                        duration_minutes: duration
                    });
                }
            }
        }

        res.json({
            summary,
            daily_records: dailyRecords,
            pending_requests: pendingRequests,
            processed_requests: processedRequests,
            missed_shifts: missedShifts
        });

    } catch (error) {
        logger.error('Error fetching payroll details:', error);
        res.status(500).json({ error: 'Failed to fetch payroll details' });
    }
};

export const recordPayment = (req: AuthRequest, res: Response): void => {
    try {
        const { user_id, startDate, endDate } = req.body;
        const actorId = req.user!.id;

        if (!user_id || !startDate || !endDate) {
            res.status(400).json({ error: 'Missing required fields: user_id, startDate, endDate' });
            return;
        }

        const user = db.prepare(`
            SELECT u.id, u.name, p.hourly_rate, j.title as job_title
            FROM users u
            JOIN profiles p ON u.id = p.user_id
            LEFT JOIN jobs j ON p.job_id = j.id
            WHERE u.id = ?
        `).get(user_id) as any;

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const existingPayment = db.prepare(`
            SELECT id FROM payrolls
            WHERE user_id = ? AND start_date = ? AND end_date = ? AND status = 'paid'
        `).get(user_id, startDate, endDate);

        if (existingPayment) {
            res.status(400).json({ error: 'This period has already been paid for this employee.' });
            return;
        }

        // Calculate metrics dynamically to save in the ledger
        const summary = calculateUserPayroll(user, startDate, endDate);

        const newPayment = db.transaction(() => {
            const insert = db.prepare(`
                INSERT INTO payrolls (
                    user_id, start_date, end_date, hourly_rate,
                    scheduled_working_minutes, scheduled_non_working_minutes,
                    overtime_minutes, overtime_rate_percent, deduction_minutes,
                    attendance_bonus, net_salary, status, paid_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'paid', ?)
                RETURNING *
            `);
            const record = insert.get(
                user_id, startDate, endDate, summary.hourly_rate,
                summary.scheduled_working_minutes, summary.scheduled_non_working_minutes,
                summary.overtime_minutes, summary.overtime_rate_percent, summary.deduction_minutes,
                summary.attendance_bonus, summary.net_salary, actorId
            ) as any;

            logAudit('payrolls', record.id, 'CREATE', actorId, null, record);
            return record;
        });

        const record = newPayment();
        res.json({ message: 'Payment recorded successfully', record });

    } catch (error) {
        logger.error('Error recording payment:', error);
        res.status(500).json({ error: 'Failed to record payment' });
    }
};

export const getPayrolls = (req: Request, res: Response) => {
    try {
        const { month, year, startDate, endDate, user_id } = req.query;

        let query = `
            SELECT p.*, u.name as user_name, u.email as user_email
            FROM payrolls p
            JOIN users u ON p.user_id = u.id
            WHERE 1=1
        `;
        const params: any[] = [];

        if (startDate && endDate) {
            query += ` AND p.start_date >= ? AND p.end_date <= ?`;
            params.push(startDate, endDate);
        } else if (month && year) {
            const formattedMonth = String(month).padStart(2, '0');
            query += ` AND STRFTIME('%m', p.start_date) = ? AND STRFTIME('%Y', p.start_date) = ?`;
            params.push(formattedMonth, String(year));
        }

        if (user_id) {
            query += ` AND p.user_id = ?`;
            params.push(user_id);
        }

        const payrolls = db.prepare(query).all(...params);
        res.json(payrolls);
    } catch (error) {
        logger.error('Error in getPayrolls:', error);
        res.status(500).json({ error: 'Failed to fetch payroll records' });
    }
};

export const getMyPayrolls = (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { month, year, startDate, endDate } = req.query;

        let query = `
            SELECT p.*, u.name as user_name, u.email as user_email
            FROM payrolls p
            JOIN users u ON p.user_id = u.id
            WHERE p.user_id = ?
        `;
        const params: any[] = [userId];

        if (startDate && endDate) {
            query += ` AND p.start_date >= ? AND p.end_date <= ?`;
            params.push(startDate, endDate);
        } else if (month && year) {
            const formattedMonth = String(month).padStart(2, '0');
            query += ` AND STRFTIME('%m', p.start_date) = ? AND STRFTIME('%Y', p.start_date) = ?`;
            params.push(formattedMonth, String(year));
        }

        const payrolls = db.prepare(query).all(...params);
        res.json(payrolls);
    } catch (error) {
        logger.error('Error in getMyPayrolls:', error);
        res.status(500).json({ error: 'Failed to fetch your payroll records' });
    }
};

export const getSalaryEstimate = (req: Request, res: Response): void => {
    try {
        const userId = (req as AuthRequest).user!.id;
        const todayStr = new Intl.DateTimeFormat('en-CA').format(new Date());

        // 1. Fetch user profile
        const user = db.prepare(`
            SELECT u.id, u.name, p.hourly_rate, j.title as job_title, p.hire_date
            FROM users u
            JOIN profiles p ON u.id = p.user_id
            LEFT JOIN jobs j ON p.job_id = j.id
            WHERE u.id = ?
        `).get(userId) as any;

        if (!user) {
            res.status(404).json({ error: 'User profile not found' });
            return;
        }

        // 2. Find start date: user's latest paid payroll end_date + 1 day
        const lastPayroll = db.prepare(`
            SELECT end_date FROM payrolls
            WHERE user_id = ? AND status = 'paid'
            ORDER BY end_date DESC LIMIT 1
        `).get(userId) as any;

        const earliestAtt = db.prepare(`
            SELECT date FROM daily_attendance
            WHERE user_id = ?
            ORDER BY date ASC LIMIT 1
        `).get(userId) as any;

        let startDate = todayStr;
        if (lastPayroll) {
            const lastEnd = new Date(lastPayroll.end_date + 'T00:00:00Z');
            lastEnd.setUTCDate(lastEnd.getUTCDate() + 1);
            startDate = lastEnd.toISOString().split('T')[0];
        } else if (user.hire_date) {
            startDate = user.hire_date;
        } else if (earliestAtt) {
            startDate = earliestAtt.date;
        } else {
            const nowObj = new Date(todayStr + 'T00:00:00Z');
            nowObj.setUTCDate(1);
            startDate = nowObj.toISOString().split('T')[0];
        }

        if (startDate > todayStr) {
            startDate = todayStr;
        }

        // 3. Recalculate daily attendance for all dates in the range
        const start = new Date(startDate + 'T00:00:00Z');
        const end = new Date(todayStr + 'T00:00:00Z');
        const current = new Date(start);

        while (current <= end) {
            const dateStr = current.toISOString().split('T')[0];
            recalculateUserDailyAttendance(userId, dateStr);
            current.setUTCDate(current.getUTCDate() + 1);
        }

        // 4. Calculate payroll estimate
        const estimate = calculateUserPayroll(user, startDate, todayStr);

        res.json({
            start_date: startDate,
            end_date: todayStr,
            estimated_net_salary: estimate.net_salary,
            base_salary: estimate.base_salary,
            overtime_minutes: estimate.overtime_minutes,
            deduction_minutes: estimate.deduction_minutes,
            total_deductions: estimate.total_deductions,
            attendance_bonus: estimate.attendance_bonus,
            actual_worked_hours: Number(((estimate.scheduled_working_minutes + estimate.overtime_minutes) / 60).toFixed(2))
        });
    } catch (error) {
        logger.error('Error calculating salary estimate:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
