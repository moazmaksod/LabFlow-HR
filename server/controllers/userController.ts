import { Request, Response } from 'express';
import db from '../db/index.js';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import { logAudit } from '../services/auditService.js';

import { getLogicalShiftDetails, getDashboardShifts } from '../utils/shiftUtils.js';

export const getUsers = (req: Request, res: Response): void => {
    try {
        const settingsForTz = db.prepare('SELECT timezone FROM settings WHERE id = 1').get() as any;
        const timezone = settingsForTz?.timezone || 'UTC';
        const currentServerTime = new Date().toISOString();

        // Get users with their profile and job info, excluding managers
        const users = db.prepare(`
            SELECT 
                u.id, u.name, u.email, u.role, u.created_at,
                p.status, p.job_id, p.weekly_schedule, p.device_id,
                j.title as job_title,
                (SELECT current_status FROM attendance a WHERE a.user_id = u.id AND a.check_out IS NULL ORDER BY a.check_in DESC LIMIT 1) as raw_current_status,
                (SELECT date FROM attendance a WHERE a.user_id = u.id AND a.check_out IS NULL ORDER BY a.check_in DESC LIMIT 1) as current_attendance_date
            FROM users u
            LEFT JOIN profiles p ON u.id = p.user_id
            LEFT JOIN jobs j ON p.job_id = j.id
            WHERE u.role != 'manager'
            ORDER BY u.created_at DESC
        `).all() as any[];

        // Refine current_status strictly based on the schedule
        users.forEach(user => {
            let schedule = null;
            if (user.weekly_schedule) {
                try {
                    schedule = JSON.parse(user.weekly_schedule);
                } catch (e) {
                    console.error('Error parsing weekly schedule:', e);
                }
            }

            // Remove weekly_schedule from payload as it's large and unnecessary here
            delete user.weekly_schedule;

            if (user.raw_current_status) {
                // We only consider the status valid if the logic date matches the current shift date
                const shiftDetails = getLogicalShiftDetails(schedule, currentServerTime, timezone, 'check_in');

                // If the user's open attendance record date matches the current logical shift date,
                // or if there is no scheduled shift at all but they are working, we show their status.
                // Otherwise, the open shift is stale.
                if (user.current_attendance_date === shiftDetails.logicalDate || !shiftDetails.shift) {
                    user.current_status = user.raw_current_status;
                } else {
                    user.current_status = null;
                }
            } else {
                user.current_status = null;
            }

            delete user.raw_current_status;
            delete user.current_attendance_date;
        });

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
            const oldUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
            const oldProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(id);

            // Update user role
            db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);

            // If assigning to employee, ensure profile exists and update job_id
            let profileExists = false;
            if (role === 'employee' || role === 'manager') {
                profileExists = !!db.prepare('SELECT id FROM profiles WHERE user_id = ?').get(id);
                
                if (profileExists) {
                    db.prepare('UPDATE profiles SET job_id = ?, status = ? WHERE user_id = ?')
                      .run(job_id || null, 'active', id);
                } else {
                    db.prepare('INSERT INTO profiles (user_id, job_id, status) VALUES (?, ?, ?)')
                      .run(id, job_id || null, 'active');
                }
            }

            const updatedUserRecord = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
            const updatedProfileRecord = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(id);

            logAudit('users', Number(id), 'UPDATE', (req as AuthRequest).user!.id, oldUser, updatedUserRecord);
            if (role === 'employee' || role === 'manager') {
                if (profileExists) {
                    logAudit('profiles', (oldProfile as any).id, 'UPDATE', (req as AuthRequest).user!.id, oldProfile, updatedProfileRecord);
                } else {
                    logAudit('profiles', (updatedProfileRecord as any).id, 'CREATE', (req as AuthRequest).user!.id, null, updatedProfileRecord);
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

export const getProfile = (req: AuthRequest, res: Response): void => {
    try {
        const userId = req.user!.id;
        const user = db.prepare(`
            SELECT 
                u.id, u.name, u.email, u.role,
                p.age, p.gender, p.profile_picture_url, p.status,
                p.weekly_schedule, p.hourly_rate, p.lunch_break_minutes,
                p.emergency_contact_name, p.emergency_contact_phone, p.leave_balance,
                p.bio, p.personal_phone, p.legal_name, p.id_photo_url, p.hire_date,
                p.allow_overtime, p.max_overtime_hours,
                p.job_id, j.title as job_title
            FROM users u
            LEFT JOIN profiles p ON u.id = p.user_id
            LEFT JOIN jobs j ON p.job_id = j.id
            WHERE u.id = ?
        `).get(userId) as any;

        if (!user) {
            res.status(404).json({ error: 'User not found' });
            return;
        }

        const settingsForTz = db.prepare('SELECT timezone FROM settings WHERE id = 1').get() as any;
        const timezone = settingsForTz?.timezone || 'UTC';
        const currentServerTime = new Date().toISOString();

        let parsedSchedule = null;
        try {
            if (user.weekly_schedule) {
                parsedSchedule = JSON.parse(user.weekly_schedule);
            }
        } catch (e) {
            console.error('Error parsing weekly_schedule', e);
        }

        const { currentShift, nextShift } = getDashboardShifts(parsedSchedule, currentServerTime, timezone);
        user.current_shift = currentShift;
        user.next_shift = nextShift;

        res.json(user);
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateProfile = (req: AuthRequest, res: Response): void => {
    try {
        const userId = req.user!.id;
        const body = req.body;

        const updateTransaction = db.transaction(() => {
            const oldUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
            const oldProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);

            if (body.name) {
                db.prepare('UPDATE users SET name = ? WHERE id = ?').run(body.name, userId);
            }

            const profileExists = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get(userId);
            if (profileExists) {
                // Build dynamic update query to allow setting fields to NULL
                const fields = [];
                const values = [];

                const allowedFields = [
                    'age', 'gender', 'profile_picture_url', 'weekly_schedule', 
                    'hourly_rate', 'lunch_break_minutes', 'emergency_contact_name', 
                    'emergency_contact_phone', 'leave_balance', 'bio', 'personal_phone', 
                    'legal_name', 'id_photo_url', 'hire_date', 'allow_overtime', 'max_overtime_hours'
                ];

                for (const field of allowedFields) {
                    if (Object.prototype.hasOwnProperty.call(body, field)) {
                        fields.push(`${field} = ?`);
                        let value = body[field];
                        if (field === 'weekly_schedule' && value) {
                            value = typeof value === 'string' ? value : JSON.stringify(value);
                        }
                        if (field === 'allow_overtime') {
                            value = value ? 1 : 0;
                        }
                        values.push(value === undefined ? null : value);
                    }
                }

                if (fields.length > 0) {
                    values.push(userId);
                    db.prepare(`UPDATE profiles SET ${fields.join(', ')} WHERE user_id = ?`).run(...values);
                }
            } else {
                db.prepare(`
                    INSERT INTO profiles (
                        user_id, age, gender, profile_picture_url, status,
                        weekly_schedule, hourly_rate, lunch_break_minutes,
                        emergency_contact_name, emergency_contact_phone, leave_balance,
                        bio, personal_phone, legal_name, id_photo_url, hire_date,
                        allow_overtime, max_overtime_hours
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    userId, 
                    body.age || null, 
                    body.gender || null, 
                    body.profile_picture_url || null, 
                    'active',
                    body.weekly_schedule ? JSON.stringify(body.weekly_schedule) : null,
                    body.hourly_rate || 0,
                    body.lunch_break_minutes || 0,
                    body.emergency_contact_name || null,
                    body.emergency_contact_phone || null,
                    body.leave_balance || 21,
                    body.bio || null,
                    body.personal_phone || null,
                    body.legal_name || null,
                    body.id_photo_url || null,
                    body.hire_date || null,
                    body.allow_overtime ? 1 : 0,
                    body.max_overtime_hours || 0
                );
            }

            const updatedUserRecord = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
            const updatedProfileRecord = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);

            logAudit('users', userId, 'UPDATE', userId, oldUser, updatedUserRecord);
            if (profileExists) {
                logAudit('profiles', (oldProfile as any).id, 'UPDATE', userId, oldProfile, updatedProfileRecord);
            } else {
                logAudit('profiles', (updatedProfileRecord as any).id, 'CREATE', userId, null, updatedProfileRecord);
            }
        });

        updateTransaction();

        const updatedUser = db.prepare(`
            SELECT 
                u.id, u.name, u.email, u.role,
                p.age, p.gender, p.profile_picture_url,
                p.weekly_schedule, p.hourly_rate, p.lunch_break_minutes,
                p.emergency_contact_name, p.emergency_contact_phone, p.leave_balance,
                p.bio, p.personal_phone, p.legal_name, p.id_photo_url, p.hire_date,
                p.allow_overtime, p.max_overtime_hours,
                p.job_id, j.title as job_title
            FROM users u
            LEFT JOIN profiles p ON u.id = p.user_id
            LEFT JOIN jobs j ON p.job_id = j.id
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
                p.bio, p.personal_phone, p.legal_name, p.id_photo_url, p.hire_date,
                p.job_id, j.title as job_title,
                p.status, p.suspension_reason,
                p.allow_overtime, p.max_overtime_hours,
                p.device_id
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
        const body = req.body;

        const updateTransaction = db.transaction(() => {
            const oldUser = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
            const oldProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(id);

            const userToUpdate = db.prepare('SELECT role FROM users WHERE id = ?').get(id) as { role: string } | undefined;
            
            // Enforce 'employee' role for non-managers when updating via this HR interface
            let roleToSet = userToUpdate?.role;
            if (roleToSet && roleToSet !== 'manager') {
                roleToSet = 'employee';
            }

            if (body.name || roleToSet) {
                db.prepare('UPDATE users SET name = COALESCE(?, name), role = COALESCE(?, role) WHERE id = ?')
                  .run(body.name || null, roleToSet || null, id);
            }

            const profileExists = db.prepare('SELECT id FROM profiles WHERE user_id = ?').get(id);
            if (profileExists) {
                const fields = [];
                const values = [];

                const allowedFields = [
                    'age', 'gender', 'profile_picture_url', 'weekly_schedule', 
                    'hourly_rate', 'lunch_break_minutes', 'emergency_contact_name', 
                    'emergency_contact_phone', 'leave_balance', 'job_id', 'status', 
                    'suspension_reason', 'allow_overtime', 'max_overtime_hours', 
                    'bio', 'personal_phone', 'legal_name', 'id_photo_url', 'hire_date'
                ];

                for (const field of allowedFields) {
                    if (Object.prototype.hasOwnProperty.call(body, field)) {
                        fields.push(`${field} = ?`);
                        let value = body[field];
                        if (field === 'weekly_schedule' && value) {
                            value = typeof value === 'string' ? value : JSON.stringify(value);
                        }
                        if (field === 'allow_overtime') {
                            value = value ? 1 : 0;
                        }
                        if (field === 'suspension_reason' && body.status !== 'suspended') {
                            value = null;
                        }
                        values.push(value === undefined ? null : value);
                    }
                }

                if (fields.length > 0) {
                    values.push(id);
                    db.prepare(`UPDATE profiles SET ${fields.join(', ')} WHERE user_id = ?`).run(...values);
                }
            } else {
                db.prepare(`
                    INSERT INTO profiles (
                        user_id, age, gender, profile_picture_url, status, suspension_reason,
                        weekly_schedule, hourly_rate, lunch_break_minutes,
                        emergency_contact_name, emergency_contact_phone, leave_balance, job_id,
                        allow_overtime, max_overtime_hours,
                        bio, personal_phone, legal_name, id_photo_url, hire_date
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    id, 
                    body.age || null, 
                    body.gender || null, 
                    body.profile_picture_url || null, 
                    body.status || 'active',
                    body.status === 'suspended' ? body.suspension_reason : null,
                    body.weekly_schedule ? (typeof body.weekly_schedule === 'string' ? body.weekly_schedule : JSON.stringify(body.weekly_schedule)) : null,
                    body.hourly_rate || 0,
                    body.lunch_break_minutes || 0,
                    body.emergency_contact_name || null,
                    body.emergency_contact_phone || null,
                    body.leave_balance || 21,
                    body.job_id || null,
                    body.allow_overtime ? 1 : 0,
                    body.max_overtime_hours || 0,
                    body.bio || null,
                    body.personal_phone || null,
                    body.legal_name || null,
                    body.id_photo_url || null,
                    body.hire_date || null
                );
            }

            const updatedUserRecord = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
            const updatedProfileRecord = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(id);

            logAudit('users', Number(id), 'UPDATE', (req as AuthRequest).user!.id, oldUser, updatedUserRecord);
            if (profileExists) {
                logAudit('profiles', (oldProfile as any).id, 'UPDATE', (req as AuthRequest).user!.id, oldProfile, updatedProfileRecord);
            } else {
                logAudit('profiles', (updatedProfileRecord as any).id, 'CREATE', (req as AuthRequest).user!.id, null, updatedProfileRecord);
            }
        });

        updateTransaction();

        const updatedUser = db.prepare(`
            SELECT 
                u.id, u.name, u.email, u.role,
                p.age, p.gender, p.profile_picture_url,
                p.weekly_schedule, p.hourly_rate, p.lunch_break_minutes,
                p.emergency_contact_name, p.emergency_contact_phone, p.leave_balance,
                p.bio, p.personal_phone, p.legal_name, p.id_photo_url, p.hire_date,
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
        const oldProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(id);
        
        db.prepare('UPDATE profiles SET device_id = NULL WHERE user_id = ?').run(id);
        
        const updatedProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(id);
        logAudit('profiles', (updatedProfile as any).id, 'UPDATE', (req as AuthRequest).user!.id, oldProfile, updatedProfile);
        
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
