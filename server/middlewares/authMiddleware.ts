import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from '../db/index.js';

// 🛡️ Sentinel: Enforce secure JWT Secret from environment variables.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error('CRITICAL SECURITY CONFIGURATION: JWT_SECRET environment variable is missing.');
}

export interface AuthRequest extends Request {
    user?: {
        id: number;
        role: string;
    };
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized: No token provided' });
        return;
    }

    const token = authHeader.split(' ')[1];
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { id: number; role: string };
        
        // Verify user still exists in DB
        const user = db.prepare('SELECT id FROM users WHERE id = ?').get(decoded.id);
        if (!user) {
            res.status(401).json({ error: 'Unauthorized: User no longer exists' });
            return;
        }

        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
        return;
    }
};

export const requireRole = (roles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            res.status(401).json({ error: 'Unauthorized: No user context found' });
            return;
        }
        
        if (!roles.includes(req.user.role)) {
            res.status(403).json({ error: 'Forbidden: Insufficient permissions' });
            return;
        }
        
        next();
    };
};
