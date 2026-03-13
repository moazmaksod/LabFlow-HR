import { Request, Response } from 'express';
import db from '../db/index.js';

export const getUsers = (req: Request, res: Response): void => {
    try {
        // Get users with their profile and job info, excluding managers
        const users = db.prepare(`
            SELECT 
                u.id, u.name, u.email, u.role, u.created_at,
                p.status, p.job_id,
                j.title as job_title,
                (SELECT current_status FROM attendance a WHERE a.user_id = u.id AND a.check_out IS NULL ORDER BY a.check_in DESC LIMIT 1) as current_status
            FROM users u
            LEFT JOIN profiles p ON u.id = p.user_id
            LEFT JOIN jobs j ON p.job_id = j.id
            WHERE u.role != 'manager'
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

export const getProfile = (req: Request, res: Response): void => {
    try {
        const userId = (req as any).user.id;
        const user = db.prepare(`
            SELECT 
                u.id, u.name, u.email, u.role,
                p.age, p.gender, p.profile_picture_url,
                p.weekly_schedule, p.hourly_rate, p.lunch_break_minutes,
                p.emergency_contact_name, p.emergency_contact_phone, p.leave_balance
            FROM users u
            LEFT JOIN profiles p ON u.id = p.user_id
            WHERE u.id = ?
        `).get(userId);

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        res.json(user);
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateProfile = (req: Request, res: Response): void => {
    try {
        const userId = (req as any).user.id;
        const { 
            name, age, gender, profile_picture_url,
            weekly_schedule, hourly_rate, lunch_break_minutes,
            emergency_contact_name, emergency_contact_phone, leave_balance
        } = req.body;

        const updateTransaction = db.transaction(() => {
            if (name) {
                db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, userId);
            }

            const profileExists = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get(userId);
            if (profileExists) {
                db.prepare(`
                    UPDATE profiles 
                    SET age = COALESCE(?, age), 
                        gender = COALESCE(?, gender), 
                        profile_picture_url = COALESCE(?, profile_picture_url),
                        weekly_schedule = COALESCE(?, weekly_schedule),
                        hourly_rate = COALESCE(?, hourly_rate),
                        lunch_break_minutes = COALESCE(?, lunch_break_minutes),
                        emergency_contact_name = COALESCE(?, emergency_contact_name),
                        emergency_contact_phone = COALESCE(?, emergency_contact_phone),
                        leave_balance = COALESCE(?, leave_balance)
                    WHERE user_id = ?
                `).run(
                    age || null, 
                    gender || null, 
                    profile_picture_url || null,
                    weekly_schedule ? JSON.stringify(weekly_schedule) : null,
                    hourly_rate !== undefined ? hourly_rate : null,
                    lunch_break_minutes !== undefined ? lunch_break_minutes : null,
                    emergency_contact_name || null,
                    emergency_contact_phone || null,
                    leave_balance !== undefined ? leave_balance : null,
                    userId
                );
            } else {
                db.prepare(`
                    INSERT INTO profiles (
                        user_id, age, gender, profile_picture_url, status,
                        weekly_schedule, hourly_rate, lunch_break_minutes,
                        emergency_contact_name, emergency_contact_phone, leave_balance
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    userId, 
                    age || null, 
                    gender || null, 
                    profile_picture_url || null, 
                    'active',
                    weekly_schedule ? JSON.stringify(weekly_schedule) : null,
                    hourly_rate || 0,
                    lunch_break_minutes || 0,
                    emergency_contact_name || null,
                    emergency_contact_phone || null,
                    leave_balance || 21
                );
            }
        });

        updateTransaction();

        const updatedUser = db.prepare(`
            SELECT 
                u.id, u.name, u.email, u.role,
                p.age, p.gender, p.profile_picture_url,
                p.weekly_schedule, p.hourly_rate, p.lunch_break_minutes,
                p.emergency_contact_name, p.emergency_contact_phone, p.leave_balance
            FROM users u
            LEFT JOIN profiles p ON u.id = p.user_id
            WHERE u.id = ?
        `).get(userId);

        res.json(updatedUser);
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getUserById = (req: Request, res: Response): void => {
    try {
        const { id } = req.params;
        const user = db.prepare(`
            SELECT 
                u.id, u.name, u.email, u.role,
                p.age, p.gender, p.profile_picture_url,
                p.weekly_schedule, p.hourly_rate, p.lunch_break_minutes,
                p.emergency_contact_name, p.emergency_contact_phone, p.leave_balance,
                p.job_id, j.title as job_title,
                p.status, p.suspension_reason,
                p.allow_overtime, p.max_overtime_hours
            FROM users u
            LEFT JOIN profiles p ON u.id = p.user_id
            LEFT JOIN jobs j ON p.job_id = j.id
            WHERE u.id = ?
        `).get(id);

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        res.json(user);
    } catch (error) {
        console.error('Error fetching user by id:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateUserProfile = (req: Request, res: Response): void => {
    try {
        const { id } = req.params;
        const { 
            name, age, gender, profile_picture_url,
            weekly_schedule, hourly_rate, lunch_break_minutes,
            emergency_contact_name, emergency_contact_phone, leave_balance,
            job_id, role, status, suspension_reason,
            allow_overtime, max_overtime_hours
        } = req.body;

        const updateTransaction = db.transaction(() => {
            if (name || role) {
                db.prepare('UPDATE users SET name = COALESCE(?, name), role = COALESCE(?, role) WHERE id = ?')
                  .run(name || null, role || null, id);
            }

            const profileExists = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get(id);
            if (profileExists) {
                db.prepare(`
                    UPDATE profiles 
                    SET age = COALESCE(?, age), 
                        gender = COALESCE(?, gender), 
                        profile_picture_url = COALESCE(?, profile_picture_url),
                        weekly_schedule = COALESCE(?, weekly_schedule),
                        hourly_rate = COALESCE(?, hourly_rate),
                        lunch_break_minutes = COALESCE(?, lunch_break_minutes),
                        emergency_contact_name = COALESCE(?, emergency_contact_name),
                        emergency_contact_phone = COALESCE(?, emergency_contact_phone),
                        leave_balance = COALESCE(?, leave_balance),
                        job_id = COALESCE(?, job_id),
                        status = COALESCE(?, status),
                        suspension_reason = COALESCE(?, suspension_reason),
                        allow_overtime = COALESCE(?, allow_overtime),
                        max_overtime_hours = COALESCE(?, max_overtime_hours)
                    WHERE user_id = ?
                `).run(
                    age || null, 
                    gender || null, 
                    profile_picture_url || null,
                    weekly_schedule ? (typeof weekly_schedule === 'string' ? weekly_schedule : JSON.stringify(weekly_schedule)) : null,
                    hourly_rate !== undefined ? hourly_rate : null,
                    lunch_break_minutes !== undefined ? lunch_break_minutes : null,
                    emergency_contact_name || null,
                    emergency_contact_phone || null,
                    leave_balance !== undefined ? leave_balance : null,
                    job_id !== undefined ? job_id : null,
                    status || null,
                    status === 'suspended' ? suspension_reason : null,
                    allow_overtime !== undefined ? (allow_overtime ? 1 : 0) : null,
                    max_overtime_hours !== undefined ? max_overtime_hours : null,
                    id
                );
            } else {
                db.prepare(`
                    INSERT INTO profiles (
                        user_id, age, gender, profile_picture_url, status, suspension_reason,
                        weekly_schedule, hourly_rate, lunch_break_minutes,
                        emergency_contact_name, emergency_contact_phone, leave_balance, job_id,
                        allow_overtime, max_overtime_hours
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    id, 
                    age || null, 
                    gender || null, 
                    profile_picture_url || null, 
                    status || 'active',
                    status === 'suspended' ? suspension_reason : null,
                    weekly_schedule ? (typeof weekly_schedule === 'string' ? weekly_schedule : JSON.stringify(weekly_schedule)) : null,
                    hourly_rate || 0,
                    lunch_break_minutes || 0,
                    emergency_contact_name || null,
                    emergency_contact_phone || null,
                    leave_balance || 21,
                    job_id || null,
                    allow_overtime ? 1 : 0,
                    max_overtime_hours || 0
                );
            }
        });

        updateTransaction();

        const updatedUser = db.prepare(`
            SELECT 
                u.id, u.name, u.email, u.role,
                p.age, p.gender, p.profile_picture_url,
                p.weekly_schedule, p.hourly_rate, p.lunch_break_minutes,
                p.emergency_contact_name, p.emergency_contact_phone, p.leave_balance,
                p.job_id, j.title as job_title,
                p.status, p.suspension_reason,
                p.allow_overtime, p.max_overtime_hours
            FROM users u
            LEFT JOIN profiles p ON u.id = p.user_id
            LEFT JOIN jobs j ON p.job_id = j.id
            WHERE u.id = ?
        `).get(id);

        res.json(updatedUser);
    } catch (error) {
        console.error('Error updating user profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const resetDevice = (req: Request, res: Response): void => {
    try {
        const { id } = req.params;
        db.prepare('UPDATE profiles SET device_id = NULL WHERE user_id = ?').run(id);
        res.json({ message: 'Device binding reset successfully' });
    } catch (error) {
        console.error('Error resetting device binding:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const uploadAvatar = (req: Request, res: Response): void => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }

        const imageUrl = `/uploads/${req.file.filename}`;
        res.json({ url: imageUrl });
    } catch (error) {
        console.error('Error uploading avatar:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
