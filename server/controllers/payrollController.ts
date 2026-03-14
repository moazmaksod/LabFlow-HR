import { Request, Response } from 'express';
import db from '../db/index.js';

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
        console.error('Error calculating payroll summary:', error);
        res.status(500).json({ error: 'Internal server error' });
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
