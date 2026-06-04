import { Request, Response } from 'express';
import db from '../db/index.js';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import { logAudit } from '../services/auditService.js';
import logger from '../utils/logger.js';
import { generateDailyAttendance } from '../services/dailyAttendanceService.js';

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
    const hourlyRate = user.hourly_rate || 0;
    const settings = db.prepare('SELECT overtime_rate_percent FROM settings WHERE id = 1').get() as any;
    const overtimeRate = (settings?.overtime_rate_percent || 150) / 100;
    
    const dailyRecords = db.prepare(`
        SELECT * FROM daily_attendance 
        WHERE user_id = ? AND date BETWEEN ? AND ?
    `).all(user.id, start_date, end_date) as any[];

    let scheduledWorkMin = 0;
    let scheduledNonWorkMin = 0;
    let unscheduledWorkMin = 0;
    let deductionMin = 0;

    for (const record of dailyRecords) {
        scheduledWorkMin += record.scheduled_working_minutes;
        scheduledNonWorkMin += record.scheduled_non_working_minutes;
        unscheduledWorkMin += record.unscheduled_working_minutes;
        deductionMin += record.deduction_minutes;
    }

    const totalPaidMinutes = scheduledWorkMin + scheduledNonWorkMin;
    const grossBasePay = (totalPaidMinutes / 60) * hourlyRate;
    
    const totalDeductions = (deductionMin / 60) * hourlyRate;
    const overtimeBonus = (unscheduledWorkMin / 60) * (hourlyRate * overtimeRate);
    
    const netSalaryWithOvertime = grossBasePay - totalDeductions + overtimeBonus;

    return {
        user: { id: user.id, name: user.name, job_title: user.job_title, hourly_rate: hourlyRate },
        time_metrics: {
            expected_hours: Number(((scheduledWorkMin + deductionMin) / 60).toFixed(2)),
            actual_worked_hours: Number(((scheduledWorkMin + unscheduledWorkMin) / 60).toFixed(2)),
            paid_hours: Number((totalPaidMinutes / 60).toFixed(2)),
            missing_unpaid_minutes: deductionMin,
            approved_overtime_minutes: unscheduledWorkMin
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
            ...summary
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
        logger.error('Error calculating all payroll:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export function getOrCreateDraftPayroll(userId: number, dateStr: string, actorId?: number): number {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = date.getMonth();

    const startDate = new Date(year, month, 1).toISOString().split('T')[0];
    const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

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
        const { month, year, startDate: qStartDate, endDate: qEndDate } = req.query;
        const actorId = req.user!.id;

        let startDate: string;
        let endDate: string;

        if (qStartDate && qEndDate) {
            startDate = qStartDate as string;
            endDate = qEndDate as string;
        } else {
            if (!month || !year) {
                return res.status(400).json({ error: 'Month and year are required' });
            }
            startDate = new Date(Number(year), Number(month) - 1, 1).toISOString().split('T')[0];
            endDate = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];
        }

        const users = db.prepare("SELECT id FROM users WHERE role = 'employee'").all() as any[];
        const userIds = users.map(u => u.id);

        if (userIds.length === 0) {
            return res.json({ message: 'No eligible users for payroll generation', payrolls: [] });
        }

        const generatedPayrolls: any[] = [];

        const generateTransaction = db.transaction(() => {
            const placeholders = userIds.map(() => '?').join(',');

            const existingPayrolls = db.prepare(`
                SELECT id, user_id FROM payrolls
                WHERE user_id IN (${placeholders}) AND start_date = ? AND end_date = ? AND status = 'draft'
            `).all(...userIds, startDate, endDate) as any[];

            const payrollMap = new Map<number, number>(existingPayrolls.map(p => [p.user_id, p.id]));
            const missingUsers = users.filter((user: any) => !payrollMap.has(user.id));

            if (missingUsers.length > 0) {
                const insertStmt = db.prepare(`
                    INSERT INTO payrolls (user_id, start_date, end_date, base_salary, status)
                    VALUES (?, ?, ?, 0, 'draft')
                    RETURNING *
                `);

                const newPayrolls: any[] = [];
                for (const user of missingUsers) {
                    const payroll = insertStmt.get(user.id, startDate, endDate);
                    newPayrolls.push(payroll);
                }

                const auditStmt = db.prepare(`
                    INSERT INTO audit_logs (entity_name, entity_id, action, actor_id, old_values, new_values)
                    VALUES (?, ?, ?, ?, ?, ?)
                `);

                for (const p of newPayrolls) {
                    auditStmt.run('payrolls', p.id, 'CREATE', actorId, null, JSON.stringify(p));
                    payrollMap.set(p.user_id, p.id);
                }
            }

            const allPayrollIds = Array.from(payrollMap.values());
            const payrollPlaceholders = allPayrollIds.map(() => '?').join(',');

            const profiles = db.prepare(`
                SELECT p.user_id, p.hourly_rate
                FROM profiles p
                WHERE p.user_id IN (${placeholders})
            `).all(...userIds) as any[];
            const profileMap = new Map(profiles.map(p => [p.user_id, p]));

            const allTransactions = db.prepare(`
                SELECT payroll_id, type, amount, status
                FROM payroll_transactions
                WHERE payroll_id IN (${payrollPlaceholders}) AND status = 'applied'
            `).all(...allPayrollIds) as any[];

            const transactionMap = new Map<number, { additions: number; deductions: number }>();
            for (const tx of allTransactions) {
                let agg = transactionMap.get(tx.payroll_id);
                if (!agg) {
                    agg = { additions: 0, deductions: 0 };
                    transactionMap.set(tx.payroll_id, agg);
                }
                if (tx.type === 'overtime' || tx.type === 'bonus') {
                    agg.additions += tx.amount;
                } else if (tx.type === 'late_deduction' || tx.type === 'step_away_unpaid' || tx.type === 'deduction' || tx.type === 'disciplinary_penalty') {
                    agg.deductions += tx.amount;
                }
            }
            
            const settings = db.prepare('SELECT overtime_rate_percent FROM settings WHERE id = 1').get() as any;
            const overtimeRate = (settings?.overtime_rate_percent || 150) / 100;

            const oldPayrolls = db.prepare(`
                SELECT * FROM payrolls WHERE id IN (${payrollPlaceholders})
            `).all(...allPayrollIds) as any[];
            const oldPayrollMap = new Map(oldPayrolls.map(p => [p.id, p]));

            const updateStmt = db.prepare(`
                UPDATE payrolls
                SET base_salary = ?, total_additions = ?, total_deductions = ?, net_salary = ?
                WHERE id = ?
            `);
            
            const dailyRecordsStmt = db.prepare(`
                SELECT * FROM daily_attendance WHERE user_id = ? AND date BETWEEN ? AND ?
            `);

            for (const user of users) {
                const payrollId = payrollMap.get(user.id)!;
                const oldPayroll = oldPayrollMap.get(payrollId);
                const profile = profileMap.get(user.id);

                const dailyRecords = dailyRecordsStmt.all(user.id, startDate, endDate) as any[];

                let scheduledWorkMin = 0;
                let scheduledNonWorkMin = 0;
                let deductionMin = 0;
                let unscheduledWorkMin = 0;

                for (const record of dailyRecords) {
                    scheduledWorkMin += record.scheduled_working_minutes;
                    scheduledNonWorkMin += record.scheduled_non_working_minutes;
                    deductionMin += record.deduction_minutes;
                    unscheduledWorkMin += record.unscheduled_working_minutes;
                }
                
                const hourlyRate = profile?.hourly_rate || 0;
                const baseSalary = ((scheduledWorkMin + scheduledNonWorkMin) / 60) * hourlyRate;
                const timeDeductions = (deductionMin / 60) * hourlyRate;
                const timeOvertime = (unscheduledWorkMin / 60) * (hourlyRate * overtimeRate);

                const agg = transactionMap.get(payrollId) || { additions: 0, deductions: 0 };
                const totalAdditions = agg.additions + timeOvertime;
                const totalDeductions = agg.deductions + timeDeductions;

                const netSalary = baseSalary + totalAdditions - totalDeductions;

                updateStmt.run(baseSalary, totalAdditions, totalDeductions, netSalary, payrollId);

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
        logger.error('Error generating draft payroll:', error);
        res.status(500).json({ error: 'Failed to generate draft payroll' });
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

export const getPayrollTransactions = (req: Request, res: Response) => {
    try {
        const { payroll_id } = req.params;
        const transactions = db.prepare(`
            SELECT * FROM payroll_transactions WHERE payroll_id = ? ORDER BY created_at DESC
        `).all(payroll_id);
        res.json(transactions);
    } catch (error) {
        logger.error('Error fetching payroll transactions:', error);
        res.status(500).json({ error: 'Failed to fetch payroll transactions' });
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

export const getMyPayrollTransactions = (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.id;
        const { payroll_id } = req.params;

        const payroll = db.prepare('SELECT user_id FROM payrolls WHERE id = ?').get(payroll_id) as any;
        if (!payroll || payroll.user_id !== userId) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const transactions = db.prepare(`
            SELECT * FROM payroll_transactions WHERE payroll_id = ? ORDER BY created_at DESC
        `).all(payroll_id);
        res.json(transactions);
    } catch (error) {
        logger.error('Error in getMyPayrollTransactions:', error);
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
        logger.error('Error updating payroll status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
