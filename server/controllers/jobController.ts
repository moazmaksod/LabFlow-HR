import { Request, Response } from 'express';
import db from '../db/index.js';

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
            preferred_gender,
            min_age,
            max_age,
            grace_period,
            weekly_schedule
        } = req.body;

        if (!title || hourly_rate === undefined || required_hours_per_week === undefined) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        const insert = db.prepare(`
            INSERT INTO jobs (
                title, 
                hourly_rate, 
                required_hours, -- Keep for backward compatibility if needed, but we'll set it to 0 or same as weekly
                required_hours_per_week,
                preferred_gender,
                min_age,
                max_age,
                grace_period,
                weekly_schedule
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        
        const info = insert.run(
            title, 
            hourly_rate, 
            required_hours_per_week, // Setting daily required_hours to weekly for now or just 0
            required_hours_per_week,
            preferred_gender || 'any',
            min_age || null,
            max_age || null,
            grace_period || 15,
            weekly_schedule || null
        );
        
        const newJob = db.prepare('SELECT * FROM jobs WHERE id = ?').get(info.lastInsertRowid);
        
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
            preferred_gender,
            min_age,
            max_age,
            grace_period,
            weekly_schedule
        } = req.body;

        if (!title || hourly_rate === undefined || required_hours_per_week === undefined) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        const transaction = db.transaction(() => {
            const update = db.prepare(`
                UPDATE jobs SET 
                    title = ?, 
                    hourly_rate = ?, 
                    required_hours = ?, 
                    required_hours_per_week = ?,
                    preferred_gender = ?,
                    min_age = ?,
                    max_age = ?,
                    grace_period = ?,
                    weekly_schedule = ?
                WHERE id = ?
            `);
            
            const result = update.run(
                title, 
                hourly_rate, 
                required_hours_per_week, 
                required_hours_per_week,
                preferred_gender || 'any',
                min_age || null,
                max_age || null,
                grace_period || 15,
                weekly_schedule || null,
                id
            );

            if (result.changes === 0) {
                return false;
            }

            // Inheritance Logic: Cascade update to all employees assigned to this job
            // Only update if they haven't overridden their schedule (for simplicity, we update all)
            db.prepare(`
                UPDATE profiles 
                SET weekly_schedule = ?
                WHERE job_id = ?
            `).run(weekly_schedule || null, id);

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

        res.json({ message: 'Job deleted successfully' });
    } catch (error) {
        console.error('Error deleting job:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
