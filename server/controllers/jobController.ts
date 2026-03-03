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
        const { title, hourly_rate, required_hours, shift_start, shift_end, grace_period } = req.body;

        if (!title || hourly_rate === undefined || required_hours === undefined || !shift_start || !shift_end) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        const insert = db.prepare(`
            INSERT INTO jobs (title, hourly_rate, required_hours, shift_start, shift_end, grace_period)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        const info = insert.run(title, hourly_rate, required_hours, shift_start, shift_end, grace_period || 15);
        
        const newJob = db.prepare('SELECT * FROM jobs WHERE id = ?').get(info.lastInsertRowid);
        
        res.status(201).json(newJob);
    } catch (error) {
        console.error('Error creating job:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
