import { Request, Response } from 'express';
import db from '../db/index.js';

export const getPayroll = (req: Request, res: Response): void => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            res.status(400).json({ error: 'startDate and endDate are required' });
            return;
        }

        const payrollData = db.prepare(`
            SELECT 
                u.id as user_id,
                u.name as user_name,
                j.title as job_title,
                COALESCE(p.hourly_rate, j.hourly_rate) as hourly_rate,
                ROUND(SUM((julianday(a.check_out) - julianday(a.check_in)) * 24), 2) as total_hours,
                ROUND(SUM((julianday(a.check_out) - julianday(a.check_in)) * 24) * COALESCE(p.hourly_rate, j.hourly_rate), 2) as total_pay
            FROM users u
            JOIN profiles p ON u.id = p.user_id
            JOIN jobs j ON p.job_id = j.id
            JOIN attendance a ON u.id = a.user_id
            WHERE a.date >= ? AND a.date <= ? AND a.check_out IS NOT NULL
            GROUP BY u.id
            ORDER BY u.name ASC
        `).all(startDate, endDate);

        res.json(payrollData);
    } catch (error) {
        console.error('Error calculating payroll:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
