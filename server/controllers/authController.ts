import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db/index.js';
import { logAudit } from '../services/auditService.js';
import { AuthRequest } from '../middlewares/authMiddleware.js';

// 🛡️ Sentinel: Enforce secure JWT Secret from environment variables.
// Do not use hardcoded fallbacks that could be exploited if env vars are missing.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('CRITICAL SECURITY CONFIGURATION: JWT_SECRET environment variable is missing.');
}

export const register = async (req: Request, res: Response): Promise<void> => {
    try {
        const { name, email, password, date_of_birth, gender } = req.body;
        
        if (!name || !email || !password || date_of_birth === undefined || !gender) {
            res.status(400).json({ error: 'Missing required fields: name, email, password, date_of_birth, gender' });
            return;
        }

        const normalizedEmail = email.toLowerCase();

        // Validate date of birth
        if (typeof date_of_birth !== 'string' || !date_of_birth.trim()) {
            res.status(400).json({ error: 'Missing required fields: name, email, password, date_of_birth, gender' });
            return;
        }

        // Validate gender
        if (!['male', 'female'].includes(gender.toLowerCase())) {
            res.status(400).json({ error: 'Invalid gender. Must be "male" or "female".' });
            return;
        }

        // Check if user already exists
        const existingUser = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(normalizedEmail);
        if (existingUser) {
            res.status(409).json({ error: 'Email already in use' });
            return;
        }

        // Hash password
        const salt = await bcrypt.genSalt(10);
        const password_hash = await bcrypt.hash(password, salt);

        // Start a transaction to ensure both user and profile are created
        const registerTransaction = db.transaction(() => {
            // Insert user (default role is 'pending' as per schema)
            const insertUser = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)');
            const info = insertUser.run(name, normalizedEmail, password_hash);
            const userId = info.lastInsertRowid;

            // Insert profile
            const insertProfile = db.prepare('INSERT INTO profiles (user_id, date_of_birth, gender, status, annual_leave_balance, sick_leave_balance) VALUES (?, ?, ?, ?, ?, ?)');
            insertProfile.run(userId, date_of_birth || null, gender.toLowerCase(), 'inactive', 21, 7);

            return userId;
        });

        const userId = registerTransaction();

        // Log Audit
        logAudit('users', Number(userId), 'REGISTER', Number(userId), null, { name, email: normalizedEmail, role: 'pending' });

        // Generate JWT
        const token = jwt.sign(
            { id: userId, role: 'pending' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: { id: userId, name, email: normalizedEmail, role: 'pending' }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password, deviceId } = req.body;
 
        if (!email || !password) {
            res.status(400).json({ error: 'Missing required fields: email, password' });
            return;
        }

        const normalizedEmail = email.toLowerCase();

        // Fetch user and profile status
        const user = db.prepare(`
            SELECT u.*, p.status, p.suspension_reason, p.device_id 
            FROM users u 
            LEFT JOIN profiles p ON u.id = p.user_id 
            WHERE LOWER(u.email) = ?
        `).get(normalizedEmail) as any;
        
        if (!user) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        if (user.status === 'suspended') {
            res.status(403).json({ 
                error: 'Account suspended', 
                suspension_reason: user.suspension_reason || 'No reason provided.' 
            });
            return;
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        // Platform Restriction: Web Login (No deviceId) vs Mobile Login (With deviceId)
        if (!deviceId) {
            // Web Login
            if (user.role !== 'manager') {
                res.status(403).json({ error: 'Access Denied: Only administrators are allowed to login from the web application.' });
                return;
            }
        } else {
            // Mobile Login - Device Binding Security Check
            if (!user.device_id) {
                // First time login, bind device
                // Check if this device is already registered to someone else
                const existingDevice = db.prepare('SELECT user_id FROM profiles WHERE device_id = ?').get(deviceId) as any;
                if (existingDevice && existingDevice.user_id !== user.id) {
                    res.status(403).json({ error: 'Security Alert: This device is already registered to another user. One device per user is allowed.' });
                    return;
                }
                db.prepare('UPDATE profiles SET device_id = ? WHERE user_id = ?').run(deviceId, user.id);
            } else if (user.device_id !== deviceId) {
                res.status(403).json({ error: 'Security Alert: You are trying to login from an unauthorized device. Please use your registered phone or contact the manager.' });
                return;
            }
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        // Log Audit
        logAudit('users', user.id, 'LOGIN', user.id, null, { deviceId, email: normalizedEmail });

        res.json({
            message: 'Login successful',
            token,
            user: { id: user.id, name: user.name, email: user.email, role: user.role }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        
        // Log Audit
        logAudit('users', userId, 'LOGOUT', userId, null, null);

        res.json({ message: 'Logout successful' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const resetAdminDeviceID = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user!.id;
        const userRole = req.user!.role;

        if (userRole !== 'manager') {
            res.status(403).json({ error: 'Access Denied: Only managers can reset their own device binding.' });
            return;
        }

        const profile = db.prepare('SELECT device_id FROM profiles WHERE user_id = ?').get(userId) as any;
        const oldDeviceId = profile?.device_id;

        db.prepare('UPDATE profiles SET device_id = NULL WHERE user_id = ?').run(userId);

        // Log Audit
        logAudit('profiles', userId, 'RESET_DEVICE_BINDING', userId, { device_id: oldDeviceId }, { device_id: null });

        res.json({ message: 'Mobile device binding reset successfully. You can now pair a new device from your phone.' });
    } catch (error) {
        console.error('Reset device error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
