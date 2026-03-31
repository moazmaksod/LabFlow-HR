import { Request, Response } from 'express';
import db from '../db/index.js';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import { logAudit } from '../services/auditService.js';

const calculateUserPayroll = (user: any, start_date: string, end_date: string) => {
    const hourlyRate = user.hourly_rate || 0;
    const schedule = user.weekly_schedule ? JSON.parse(user.weekly_schedule) : {};

    // Fetch Attendance Logs for the period
    const logs = db.prepare(`
        SELECT * FROM attendance
        WHERE user_id = ? AND date BETWEEN ? AND ?
        ORDER BY date ASC
    `).all(user.id, start_date, end_date) as any[];

    let totalExpectedMinutes = 0;
    let totalActualWorkedMinutes = 0;
    let totalPaidPermissionMinutes = 0;
    let totalMissingMinutes = 0;
    let totalApprovedOvertimeMinutes = 0;

    const start = new Date(start_date as string);
    const end = new Date(end_date as string);
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    // Fetch all breaks in one query to avoid N+1 query performance issue
    const logIds = logs.map(l => l.id);
    const breaksMap = new Map<number, any[]>();

    if (logIds.length > 0) {
        const placeholders = logIds.map(() => '?').join(',');
        const allBreaks = db.prepare(`
            SELECT attendance_id, start_time, end_time
            FROM shift_interruptions
            WHERE attendance_id IN (${placeholders})
        `).all(...logIds) as any[];

        allBreaks.forEach(b => {
            if (!breaksMap.has(b.attendance_id)) {
                breaksMap.set(b.attendance_id, []);
            }
            breaksMap.get(b.attendance_id)!.push(b);
        });
    }

    // Calculate expected minutes for the whole period
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayName = days[d.getDay()];
        const dayShifts = schedule[dayName] || [];

        dayShifts.forEach((shift: any) => {
            const [startH, startM] = shift.start.split(':').map(Number);
            const [endH, endM] = shift.end.split(':').map(Number);
            totalExpectedMinutes += (endH * 60 + endM) - (startH * 60 + startM);
        });
    }

    logs.forEach(log => {
        const d = new Date(log.date);
        const dayName = days[d.getDay()];
        const dayShifts = schedule[dayName] || [];
        let expectedForDay = 0;
        dayShifts.forEach((shift: any) => {
            const [startH, startM] = shift.start.split(':').map(Number);
            const [endH, endM] = shift.end.split(':').map(Number);
            expectedForDay += (endH * 60 + endM) - (startH * 60 + startM);
        });

        let workedMinutes = 0;
        if (log.check_in && log.check_out) {
            const checkIn = new Date(log.check_in);
            const checkOut = new Date(log.check_out);
            workedMinutes = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60);

            const breaks = breaksMap.get(log.id) || [];
            breaks.forEach(b => {
                if (b.start_time && b.end_time) {
                    workedMinutes -= (new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / (1000 * 60);
                }
            });
        }

        workedMinutes = Math.max(0, workedMinutes);
        totalApprovedOvertimeMinutes += log.approved_overtime_minutes || 0;

        if (log.status === 'absent') {
            totalMissingMinutes += expectedForDay;
        } else {
            totalActualWorkedMinutes += workedMinutes;
            totalMissingMinutes += Math.max(0, expectedForDay - workedMinutes);
            totalPaidPermissionMinutes += log.paid_permission_minutes || 0;
        }
    });

    // Add missing days that weren't in logs but had expected shifts
    const logDates = new Set(logs.map(l => l.date));
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        if (!logDates.has(dateStr)) {
            const dayName = days[d.getDay()];
            const dayShifts = schedule[dayName] || [];
            dayShifts.forEach((shift: any) => {
                const [startH, startM] = shift.start.split(':').map(Number);
                const [endH, endM] = shift.end.split(':').map(Number);
                totalMissingMinutes += (endH * 60 + endM) - (startH * 60 + startM);
            });
        }
    }

    const unpaidMinutes = Math.max(0, totalMissingMinutes - totalPaidPermissionMinutes);
    const netWorkedMinutes = Math.max(0, totalActualWorkedMinutes - unpaidMinutes);
    const finalNetSalary = (netWorkedMinutes / 60) * hourlyRate;

    const grossBasePay = (totalActualWorkedMinutes / 60) * hourlyRate;
    const totalDeductions = (unpaidMinutes / 60) * hourlyRate;
    const overtimeBonus = (totalApprovedOvertimeMinutes / 60) * (hourlyRate * 1.5);
    const netSalaryWithOvertime = finalNetSalary + overtimeBonus;

    return {
        user: { id: user.id, name: user.name, job_title: user.job_title, hourly_rate: hourlyRate },
        time_metrics: {
            expected_hours: Number((totalExpectedMinutes / 60).toFixed(2)),
            actual_worked_hours: Number((totalActualWorkedMinutes / 60).toFixed(2)),
            paid_permission_hours: Number((totalPaidPermissionMinutes / 60).toFixed(2)),
            missing_unpaid_minutes: Math.round(unpaidMinutes),
            approved_overtime_minutes: totalApprovedOvertimeMinutes
        },
        financial_metrics: {
            gross_base_pay: Number(grossBasePay.toFixed(2)),
            total_deductions: Number(totalDeductions.toFixed(2)),
            overtime_bonus: Number(overtimeBonus.toFixed(2)),
            final_net_salary: Number(netSalaryWithOvertime.toFixed(2))
        }
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
            SELECT u.id, u.name, p.hourly_rate, p.weekly_schedule, p.max_overtime_hours, j.title as job_title
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
            ...summary
        });

    } catch (error) {
        console.error('Error in getPayrollSummary:', error);
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

        const users = db.prepare(`
            SELECT u.id, u.name, p.hourly_rate, p.weekly_schedule, p.max_overtime_hours, j.title as job_title
            FROM users u
            JOIN profiles p ON u.id = p.user_id
            LEFT JOIN jobs j ON p.job_id = j.id
            WHERE u.role = 'employee'
        `).all() as any[];

        const results = users.map(user => {
            const summary = calculateUserPayroll(user, startDate as string, endDate as string);
            return {
                user_id: user.id,
                user_name: user.name,
                job_title: user.job_title || 'No Job',
                hourly_rate: user.hourly_rate || 0,
                total_hours: summary.time_metrics.actual_worked_hours,
                total_pay: summary.financial_metrics.final_net_salary
            };
        });

        res.json(results);

    } catch (error) {
        console.error('Error calculating all payroll:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

// Helper to get or create a draft payroll for a user for a specific month
export function getOrCreateDraftPayroll(userId: number, dateStr: string, actorId?: number): number {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth();

    // Start and end of month
    const startDate = new Date(year, month, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

    // Check if draft payroll exists
    const existing = db.prepare(`
        SELECT id FROM payrolls
        WHERE user_id = ? AND start_date = ? AND end_date = ? AND status = 'draft'
    `).get(userId, startDate, endDate) as any;

    if (existing) {
        return existing.id;
    }

    const result = db.prepare(`
        INSERT INTO payrolls (user_id, start_date, end_date, base_salary, status)
        VALUES (?, ?, ?, 0, 'draft')
    `).run(userId, startDate, endDate);

    const newPayrollId = result.lastInsertRowid as number;
    const newPayroll = db.prepare('SELECT * FROM payrolls WHERE id = ?').get(newPayrollId);

    if (actorId) {
        logAudit('payrolls', newPayrollId, 'CREATE', actorId, null, newPayroll);
    }

    return newPayrollId;
}

export const generateDraftPayroll = (req: AuthRequest, res: Response) => {
    try {
        const { month, year } = req.query;
        const actorId = req.user!.id;

        if (!month || !year) {
            return res.status(400).json({ error: 'Month and year are required' });
        }

        const startDate = new Date(Number(year), Number(month) - 1, 1).toISOString().split('T')[0];
        const endDate = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];

        // Fetch all users
        const users = db.prepare("SELECT id FROM users WHERE role = 'employee' OR role = 'manager'").all() as any[];
        const userIds = users.map(u => u.id);

        if (userIds.length === 0) {
            return res.json({ message: 'No eligible users for payroll generation', payrolls: [] });
        }

        const generatedPayrolls: any[] = [];

        const generateTransaction = db.transaction(() => {
            const placeholders = userIds.map(() => '?').join(',');

            // 1. Bulk get or create draft payrolls
            // First, find existing drafts for the period
            const existingPayrolls = db.prepare(`
                SELECT id, user_id FROM payrolls
                WHERE user_id IN (${placeholders}) AND start_date = ? AND end_date = ? AND status = 'draft'
            `).all(...userIds, startDate, endDate) as any[];

            const payrollMap = new Map<number, number>(existingPayrolls.map(p => [p.user_id, p.id]));

            // For users without a draft, create one
            for (const user of users) {
                if (!payrollMap.has(user.id)) {
                    const pid = getOrCreateDraftPayroll(user.id, startDate, actorId);
                    payrollMap.set(user.id, pid);
                }
            }

            const allPayrollIds = Array.from(payrollMap.values());
            const payrollPlaceholders = allPayrollIds.map(() => '?').join(',');

            // 2. Bulk fetch profiles and jobs
            const profiles = db.prepare(`
                SELECT p.user_id, p.hourly_rate, j.required_hours_per_week
                FROM profiles p
                LEFT JOIN jobs j ON p.job_id = j.id
                WHERE p.user_id IN (${placeholders})
            `).all(...userIds) as any[];
            const profileMap = new Map(profiles.map(p => [p.user_id, p]));

            // 3. Bulk fetch applied transactions
            const allTransactions = db.prepare(`
                SELECT payroll_id, type, amount, status
                FROM payroll_transactions
                WHERE payroll_id IN (${payrollPlaceholders}) AND status = 'applied'
            `).all(...allPayrollIds) as any[];

            const transactionMap = new Map<number, any[]>();
            for (const tx of allTransactions) {
                if (!transactionMap.has(tx.payroll_id)) transactionMap.set(tx.payroll_id, []);
                transactionMap.get(tx.payroll_id)!.push(tx);
            }

            // 4. Bulk fetch old payroll states for audit logging
            const oldPayrolls = db.prepare(`
                SELECT * FROM payrolls WHERE id IN (${payrollPlaceholders})
            `).all(...allPayrollIds) as any[];
            const oldPayrollMap = new Map(oldPayrolls.map(p => [p.id, p]));

            // Prepared statements for loop
            const updateStmt = db.prepare(`
                UPDATE payrolls
                SET base_salary = ?, total_additions = ?, total_deductions = ?, net_salary = ?
                WHERE id = ?
            `);

            for (const user of users) {
                const payrollId = payrollMap.get(user.id)!;
                const oldPayroll = oldPayrollMap.get(payrollId);
                const profile = profileMap.get(user.id);

                let baseSalary = 0;
                if (profile && profile.hourly_rate && profile.required_hours_per_week) {
                    // Approximate monthly salary: weekly hours * 4 weeks * hourly rate
                    baseSalary = profile.required_hours_per_week * 4 * profile.hourly_rate;
                }

                // Aggregate transactions from map
                const transactions = transactionMap.get(payrollId) || [];
                let totalAdditions = 0;
                let totalDeductions = 0;

                for (const tx of transactions) {
                    if (tx.type === 'overtime' || tx.type === 'bonus') {
                        totalAdditions += tx.amount;
                    } else if (tx.type === 'late_deduction' || tx.type === 'step_away_unpaid' || tx.type === 'deduction' || tx.type === 'disciplinary_penalty') {
                        totalDeductions += tx.amount;
                    }
                }

                const netSalary = baseSalary + totalAdditions - totalDeductions;

                // Update payroll using prepared statement
                updateStmt.run(baseSalary, totalAdditions, totalDeductions, netSalary, payrollId);

                // Use the updated data for generatedPayrolls and audit log
                // Since we're in a transaction, we can just construct the "updated" state
                const updatedPayroll = {
                    ...oldPayroll,
                    base_salary: baseSalary,
                    total_additions: totalAdditions,
                    total_deductions: totalDeductions,
                    net_salary: netSalary
                };

                logAudit('payrolls', payrollId, 'UPDATE', actorId, oldPayroll, updatedPayroll);

                generatedPayrolls.push({
                    payroll_id: payrollId,
                    user_id: user.id,
                    base_salary: baseSalary,
                    total_additions: totalAdditions,
                    total_deductions: totalDeductions,
                    net_salary: netSalary
                });
            }
        });

        generateTransaction();

        res.json({ message: 'Draft payrolls generated successfully', payrolls: generatedPayrolls });
    } catch (error) {
        console.error('Error generating draft payroll:', error);
        res.status(500).json({ error: 'Failed to generate draft payroll' });
    }
};

export const getPayrolls = (req: Request, res: Response) => {
    try {
        const { month, year, user_id } = req.query;

        let query = `
            SELECT p.*, u.name as user_name, u.email as user_email
            FROM payrolls p
            JOIN users u ON p.user_id = u.id
            WHERE 1=1
        `;
        const params: any[] = [];

        if (month && year) {
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
        console.error('Error in getPayrolls:', error);
        res.status(500).json({ error: 'Failed to fetch payroll records' });
    }
};

export const getPayrollTransactions = (req: Request, res: Response) => {
    try {
        const { payroll_id } = req.params;
        const transactions = db.prepare(`
            SELECT * FROM payroll_transactions WHERE payroll_id = ? ORDER BY created_at DESC
        `).all(payroll_id);
        res.json(transactions);
    } catch (error) {
        console.error('Error fetching payroll transactions:', error);
        res.status(500).json({ error: 'Failed to fetch payroll transactions' });
    }
};

export const getMyPayrolls = (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { month, year } = req.query;

        let query = `
            SELECT p.*, u.name as user_name, u.email as user_email
            FROM payrolls p
            JOIN users u ON p.user_id = u.id
            WHERE p.user_id = ?
        `;
        const params: any[] = [userId];

        if (month && year) {
            const formattedMonth = String(month).padStart(2, '0');
            query += ` AND STRFTIME('%m', p.start_date) = ? AND STRFTIME('%Y', p.start_date) = ?`;
            params.push(formattedMonth, String(year));
        }

        const payrolls = db.prepare(query).all(...params);
        res.json(payrolls);
    } catch (error) {
        console.error('Error in getMyPayrolls:', error);
        res.status(500).json({ error: 'Failed to fetch your payroll records' });
    }
};

export const getMyPayrollTransactions = (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { payroll_id } = req.params;

        // Verify ownership
        const payroll = db.prepare('SELECT user_id FROM payrolls WHERE id = ?').get(payroll_id) as any;
        if (!payroll || payroll.user_id !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const transactions = db.prepare(`
            SELECT * FROM payroll_transactions WHERE payroll_id = ? ORDER BY created_at DESC
        `).all(payroll_id);
        res.json(transactions);
    } catch (error) {
        console.error('Error in getMyPayrollTransactions:', error);
        res.status(500).json({ error: 'Failed to fetch your payroll transactions' });
    }
};

export const updatePayrollStatus = (req: AuthRequest, res: Response): void => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const actorId = req.user!.id;

        if (!['draft', 'finalized', 'paid'].includes(status)) {
            res.status(400).json({ error: 'Invalid status' });
            return;
        }

        const updateTransaction = db.transaction(() => {
            const oldPayroll = db.prepare('SELECT * FROM payrolls WHERE id = ?').get(id);
            if (!oldPayroll) {
                return null;
            }

            db.prepare('UPDATE payrolls SET status = ? WHERE id = ?').run(status, id);

            const updatedPayroll = db.prepare('SELECT * FROM payrolls WHERE id = ?').get(id);
            logAudit('payrolls', Number(id), 'UPDATE', actorId, oldPayroll, updatedPayroll);

            return updatedPayroll;
        });

        const result = updateTransaction();

        if (!result) {
            res.status(404).json({ error: 'Payroll not found' });
            return;
        }

        res.json(result);
    } catch (error) {
        console.error('Error updating payroll status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
