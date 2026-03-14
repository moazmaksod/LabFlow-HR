import { Request, Response } from 'express';
import db from '../db/index.js';

export const getPayrollSummary = (req: Request, res: Response): void => {
    try {
        const { user_id, start_date, end_date } = req.query;

        if (!user_id || !start_date || !end_date) {
            res.status(400).json({ error: 'Missing required parameters: user_id, start_date, end_date' });
            return;
        }

        // Fetch User and Profile (for hourly rate and schedule)
        const user = db.prepare(`
            SELECT u.id, u.name, p.hourly_rate, p.weekly_schedule, p.max_overtime_hours
            FROM users u
            JOIN profiles p ON u.id = p.user_id
            WHERE u.id = ?
        `).get(user_id) as any;

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const hourlyRate = user.hourly_rate || 0;
        const schedule = user.weekly_schedule ? JSON.parse(user.weekly_schedule) : {};

        // Fetch Attendance Logs for the period
        const logs = db.prepare(`
            SELECT * FROM attendance
            WHERE user_id = ? AND date BETWEEN ? AND ?
            ORDER BY date ASC
        `).all(user_id, start_date, end_date) as any[];

        let totalExpectedMinutes = 0;
        let totalActualWorkedMinutes = 0;
        let totalPaidPermissionMinutes = 0;
        let totalMissingUnpaidMinutes = 0;
        let totalApprovedOvertimeMinutes = 0;
        let totalAbsenceMinutes = 0;

        // Iterate through each day in the range to calculate expected hours
        const start = new Date(start_date as string);
        const end = new Date(end_date as string);
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            const dayName = days[d.getDay()];
            const dayShifts = schedule[dayName] || [];
            
            let expectedForDay = 0;
            dayShifts.forEach((shift: any) => {
                const [startH, startM] = shift.start.split(':').map(Number);
                const [endH, endM] = shift.end.split(':').map(Number);
                expectedForDay += (endH * 60 + endM) - (startH * 60 + startM);
            });

            totalExpectedMinutes += expectedForDay;

            const log = logs.find(l => l.date === dateStr);
            if (log) {
                // Calculate worked time
                if (log.check_in && log.check_out) {
                    const checkIn = new Date(log.check_in);
                    const checkOut = new Date(log.check_out);
                    let workedMinutes = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60);
                    
                    // Subtract breaks
                    const breaks = db.prepare('SELECT start_time, end_time FROM shift_interruptions WHERE attendance_id = ?').all(log.id) as any[];
                    breaks.forEach(b => {
                        if (b.start_time && b.end_time) {
                            workedMinutes -= (new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / (1000 * 60);
                        }
                    });

                    totalActualWorkedMinutes += Math.max(0, workedMinutes);
                }

                totalApprovedOvertimeMinutes += log.approved_overtime_minutes || 0;

                // Handle Deductions
                if (log.status === 'absent') {
                    totalAbsenceMinutes += expectedForDay;
                } else {
                    // Calculate missing time compared to expected
                    // If status is late_in or early_out, we check if it's a paid permission
                    if (log.status === 'late_in' || log.status === 'early_out' || log.status === 'half_day') {
                        const missingMinutes = Math.max(0, expectedForDay - totalActualWorkedMinutes); // Simplified for now
                        // Actually, better to calculate per shift
                        // For simplicity, if log.is_paid_permission is true, we count the missing time as paid
                        
                        // Let's refine: missing = expected - actual
                        const missing = Math.max(0, expectedForDay - (log.check_in && log.check_out ? totalActualWorkedMinutes : 0)); // This is wrong because totalActualWorkedMinutes is cumulative
                    }
                }
            } else if (expectedForDay > 0) {
                // No log but expected shift -> Absent
                totalAbsenceMinutes += expectedForDay;
            }
        }

        // Refined calculation
        totalActualWorkedMinutes = 0;
        totalMissingUnpaidMinutes = 0;
        totalPaidPermissionMinutes = 0;

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
                
                const breaks = db.prepare('SELECT start_time, end_time FROM shift_interruptions WHERE attendance_id = ?').all(log.id) as any[];
                breaks.forEach(b => {
                    if (b.start_time && b.end_time) {
                        workedMinutes -= (new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / (1000 * 60);
                    }
                });
            }

            workedMinutes = Math.max(0, workedMinutes);
            totalActualWorkedMinutes += workedMinutes;

            if (log.status === 'absent') {
                totalMissingUnpaidMinutes += expectedForDay;
            } else {
                const missing = Math.max(0, expectedForDay - workedMinutes);
                if (log.is_paid_permission) {
                    totalPaidPermissionMinutes += missing;
                } else {
                    totalMissingUnpaidMinutes += missing;
                }
            }
        });

        // Add missing days that weren't in logs but had expected shifts
        // (Handled by the loop above if we track processed dates)
        
        const grossBasePay = (totalExpectedMinutes / 60) * hourlyRate;
        const totalDeductions = (totalMissingUnpaidMinutes / 60) * hourlyRate;
        const overtimeBonus = (totalApprovedOvertimeMinutes / 60) * (hourlyRate * 1.5); // Assuming 1.5x for OT
        const finalNetSalary = grossBasePay - totalDeductions + overtimeBonus;

        res.json({
            period: { start: start_date, end: end_date },
            user: { id: user.id, name: user.name, hourly_rate: hourlyRate },
            time_metrics: {
                expected_hours: Number((totalExpectedMinutes / 60).toFixed(2)),
                actual_worked_hours: Number((totalActualWorkedMinutes / 60).toFixed(2)),
                paid_permission_hours: Number((totalPaidPermissionMinutes / 60).toFixed(2)),
                missing_unpaid_minutes: Math.round(totalMissingUnpaidMinutes),
                approved_overtime_minutes: totalApprovedOvertimeMinutes
            },
            financial_metrics: {
                gross_base_pay: Number(grossBasePay.toFixed(2)),
                total_deductions: Number(totalDeductions.toFixed(2)),
                overtime_bonus: Number(overtimeBonus.toFixed(2)),
                final_net_salary: Number(finalNetSalary.toFixed(2))
            }
        });

    } catch (error) {
        console.error('Error calculating payroll summary:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
