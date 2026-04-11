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
        
        // 🛡️ SECURITY FIX: Fetch BOTH id AND role fresh from the database on every request.
        //
        // VULNERABILITY FIXED: Previously this query only fetched `id`, causing `req.user`
        // to be set from the JWT's stale `decoded.role`. This meant role changes (e.g.,
        // demoting an employee to 'pending', or suspending an account) would not take
        // effect until the token expired (up to 7 days). A terminated or demoted employee
        // could retain full API access for the duration of their token's lifetime.
        //
        // The token still validates cryptographic integrity and expiry — the DB lookup
        // ensures the role reflects the current authoritative state.
        const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(decoded.id) as { id: number; role: string } | undefined;

        if (!user) {
            res.status(401).json({ error: 'Unauthorized: User no longer exists' });
            return;
        }

        // Use the fresh role from DB, not the potentially stale role from the token
        req.user = { id: user.id, role: user.role };
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
