import { Request, Response } from 'express';
import db from '../db/index.js';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import { logAudit } from '../services/auditService.js';

export const getSettings = (req: Request, res: Response): void => {
    try {
        const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
        if (!settings) {
            res.status(404).json({ error: 'Settings not found' });
            return;
        }
        res.json(settings);
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const updateSettings = (req: AuthRequest, res: Response): void => {
    try {
        const body = req.body;

        const updateTransaction = db.transaction(() => {
            const oldSettings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;

            if (!oldSettings) {
                return null;
            }

            // Build dynamic update query
            const keys = Object.keys(body).filter(k => Object.hasOwn(oldSettings, k) && k !== 'id' && k !== 'created_at' && k !== 'updated_at');
            if (keys.length === 0) {
                return oldSettings;
            }

            const setClause = keys.map(k => `${k} = ?`).join(', ');
            const values = keys.map(k => body[k]);

            const update = db.prepare(`
                UPDATE settings
                SET ${setClause}
                WHERE id = 1
            `);

            update.run(...values);

            const updatedSettings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
            logAudit('settings', 1, 'UPDATE', req.user!.id, oldSettings, updatedSettings);
            return updatedSettings;
        });

        const updatedSettings = updateTransaction();
        if (!updatedSettings) {
             res.status(404).json({ error: 'Settings not found' });
             return;
        }
        res.json(updatedSettings);
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
