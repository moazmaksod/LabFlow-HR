import { Request, Response } from 'express';
import db from '../db/index.js';

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

export const updateSettings = (req: Request, res: Response): void => {
    try {
        const { office_lat, office_lng, radius_meters, timezone } = req.body;

        if (office_lat === undefined || office_lng === undefined || radius_meters === undefined) {
            res.status(400).json({ error: 'Missing required fields' });
            return;
        }

        const update = db.prepare(`
            UPDATE settings 
            SET office_lat = ?, office_lng = ?, radius_meters = ?, timezone = COALESCE(?, timezone)
            WHERE id = 1
        `);
        
        update.run(office_lat, office_lng, radius_meters, timezone);
        
        const updatedSettings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
        res.json(updatedSettings);
    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
