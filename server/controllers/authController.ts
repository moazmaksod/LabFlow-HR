import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from '../db/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_do_not_use_in_prod';

export const register = async (req: Request, res: Response): Promise<void> => {
    try {
        const { name, email, password, age, gender } = req.body;
        
        if (!name || !email || !password || !age || !gender) {
            res.status(400).json({ error: 'Missing required fields: name, email, password, age, gender' });
            return;
        }

        // Validate age
        const ageNum = parseInt(age);
        if (isNaN(ageNum) || ageNum < 16 || ageNum > 100) {
            res.status(400).json({ error: 'Invalid age. Must be between 16 and 100.' });
            return;
        }

        // Validate gender
        if (!['male', 'female'].includes(gender.toLowerCase())) {
            res.status(400).json({ error: 'Invalid gender. Must be "male" or "female".' });
            return;
        }

        // Check if user already exists
        const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
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
            const info = insertUser.run(name, email, password_hash);
            const userId = info.lastInsertRowid;

            // Insert profile
            const insertProfile = db.prepare('INSERT INTO profiles (user_id, age, gender, status) VALUES (?, ?, ?, ?)');
            insertProfile.run(userId, ageNum, gender.toLowerCase(), 'inactive');

            return userId;
        });

        const userId = registerTransaction();

        // Generate JWT
        const token = jwt.sign(
            { id: userId, role: 'pending' },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            message: 'User registered successfully',
            token,
            user: { id: userId, name, email, role: 'pending' }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const login = async (req: Request, res: Response): Promise<void> => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({ error: 'Missing required fields: email, password' });
            return;
        }

        // Fetch user
        const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
        if (!user) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password_hash);
        if (!isMatch) {
            res.status(401).json({ error: 'Invalid credentials' });
            return;
        }

        // Generate JWT
        const token = jwt.sign(
            { id: user.id, role: user.role },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

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
