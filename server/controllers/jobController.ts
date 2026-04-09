import { Request, Response } from 'express';
import db from '../db/index.js';
import { logAudit } from '../services/auditService.js';
import { AuthRequest } from '../middlewares/authMiddleware.js';

export const getJobs = (req: Request, res: Response): void => {
    try {
        const jobs = db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all();
        res.json(jobs);
    } catch (error) {
        console.error('Error fetching jobs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const createJob = (req: Request, res: Response): void => {
    try {
        const {
            title,
            hourly_rate,
            required_hours_per_week,
            default_annual_leave_days,
            default_sick_leave_days,
            allow_overtime,
            employment_type
        } = req.body;

        if (!title || hourly_rate === undefined) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        const insert = db.prepare(`
            INSERT INTO jobs (
                title,
                hourly_rate,
                required_hours,
                required_hours_per_week,
                default_annual_leave_days,
                default_sick_leave_days,
                allow_overtime,
                employment_type
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const info = insert.run(
            title,
            hourly_rate,
            0,
            required_hours_per_week || 40,
            default_annual_leave_days ?? 21,
            default_sick_leave_days ?? 7,
            allow_overtime !== undefined ? (allow_overtime ? 1 : 0) : 1,
            employment_type || 'full-time'
        );
        
        const newJob = db.prepare('SELECT * FROM jobs WHERE id = ?').get(info.lastInsertRowid);
        
        logAudit('jobs', Number(info.lastInsertRowid), 'CREATE', (req as AuthRequest).user!.id, null, newJob);

        res.status(201).json(newJob);
    } catch (error) {
        console.error('Error creating job:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateJob = (req: Request, res: Response): void => {
    try {
        const { id } = req.params;
        const {
            title,
            hourly_rate,
            required_hours_per_week,
            default_annual_leave_days,
            default_sick_leave_days,
            allow_overtime,
            employment_type
        } = req.body;

        if (!title || hourly_rate === undefined) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        const transaction = db.transaction(() => {
            const oldJob = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
            if (!oldJob) return false;

            const update = db.prepare(`
                UPDATE jobs SET
                    title = ?,
                    hourly_rate = ?,
                    required_hours = ?,
                    required_hours_per_week = ?,
                    default_annual_leave_days = ?,
                    default_sick_leave_days = ?,
                    allow_overtime = ?,
                    employment_type = ?
                WHERE id = ?
            `);

            const result = update.run(
                title,
                hourly_rate,
                0,
                required_hours_per_week || 40,
                default_annual_leave_days ?? 21,
                default_sick_leave_days ?? 7,
                allow_overtime !== undefined ? (allow_overtime ? 1 : 0) : 1,
                employment_type || 'full-time',
                id
            );

            if (result.changes === 0) {
                return false;
            }

            const updatedJob = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
            logAudit('jobs', Number(id), 'UPDATE', (req as AuthRequest).user!.id, oldJob, updatedJob);

            return true;
        });

        const success = transaction();

        if (!success) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }
        
        const updatedJob = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
        
        res.json(updatedJob);
    } catch (error) {
        console.error('Error updating job:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const deleteJob = (req: Request, res: Response): void => {
    try {
        const { id } = req.params;

        const oldJob = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
        if (!oldJob) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }

        // Check if any employees are assigned to this job
        const assignedEmployees = db.prepare('SELECT id FROM profiles WHERE job_id = ?').get(id);

        if (assignedEmployees) {
            res.status(400).json({ error: 'Cannot delete this job role because employees are assigned to it.' });
            return;
        }

        const result = db.prepare('DELETE FROM jobs WHERE id = ?').run(id);

        if (result.changes === 0) {
            res.status(404).json({ error: 'Job not found' });
            return;
        }

        logAudit('jobs', Number(id), 'DELETE', (req as AuthRequest).user!.id, oldJob, null);

        res.json({ message: 'Job deleted successfully' });
    } catch (error) {
        console.error('Error deleting job:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
