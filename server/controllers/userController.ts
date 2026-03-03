import { Request, Response } from 'express';
import db from '../db/index.js';

export const getUsers = (req: Request, res: Response): void => {
    try {
        // Get users with their profile and job info
        const users = db.prepare(`
            SELECT 
                u.id, u.name, u.email, u.role, u.created_at,
                p.status, p.job_id,
                j.title as job_title
            FROM users u
            LEFT JOIN profiles p ON u.id = p.user_id
            LEFT JOIN jobs j ON p.job_id = j.id
            ORDER BY u.created_at DESC
        `).all();
        res.json(users);
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateUserRole = (req: Request, res: Response): void => {
    try {
        const { id } = req.params;
        const { role, job_id } = req.body;

        if (!role || !['manager', 'employee', 'pending'].includes(role)) {
            res.status(400).json({ error: 'Invalid role' });
            return;
        }

        // Start a transaction
        const updateTransaction = db.transaction(() => {
            // Update user role
            db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);

            // If assigning to employee, ensure profile exists and update job_id
            if (role === 'employee' || role === 'manager') {
                const profileExists = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get(id);
                
                if (profileExists) {
                    db.prepare('UPDATE profiles SET job_id = ?, status = ? WHERE user_id = ?')
                      .run(job_id || null, 'active', id);
                } else {
                    db.prepare('INSERT INTO profiles (user_id, job_id, status) VALUES (?, ?, ?)')
                      .run(id, job_id || null, 'active');
                }
            }
        });

        updateTransaction();

        const updatedUser = db.prepare(`
            SELECT 
                u.id, u.name, u.email, u.role,
                p.status, p.job_id,
                j.title as job_title
            FROM users u
            LEFT JOIN profiles p ON u.id = p.user_id
            LEFT JOIN jobs j ON p.job_id = j.id
            WHERE u.id = ?
        `).get(id);

        res.json(updatedUser);
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
