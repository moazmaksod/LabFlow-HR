import { Request, Response } from 'express';
import db from '../db/index.js';
import { AuthRequest } from '../middlewares/authMiddleware.js';
import { logAudit } from '../services/auditService.js';
import fs from 'fs';
import path from 'path';
import { getSettingsCache, setSettingsCache, clearSettingsCache } from '../utils/cache.js';
import logger from '../utils/logger.js';
import { recalculateUserDailyAttendance } from '../services/dailyAttendanceService.js';

export const getSettings = (req: Request, res: Response): void => {
    try {
        let settings = getSettingsCache();
        if (!settings) {
            settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
            if (settings) {
                setSettingsCache(settings);
            }
        }
        if (!settings) {
            res.status(404).json({ error: 'Settings not found' });
            return;
        }



        res.json(settings);
    } catch (error) {
        logger.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const getPublicSettings = (req: Request, res: Response): void => {
    try {
        let settings = getSettingsCache();
        if (!settings) {
            settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
            if (settings) {
                setSettingsCache(settings);
            }
        }
        if (!settings) {
            res.status(404).json({ error: 'Settings not found' });
            return;
        }

        res.json({
            company_name: settings.company_name,
            company_logo_url: settings.company_logo_url,
            brand_primary_color: settings.brand_primary_color
        });
    } catch (error) {
        logger.error('Error fetching public settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const uploadFavicon = (req: AuthRequest, res: Response): void => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }

        const faviconUrl = `/uploads/favicons/${req.file.filename}`;

        const updateTransaction = db.transaction(() => {
            const oldSettings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;

            if (!oldSettings) {
                return null;
            }

            if (oldSettings.company_favicon_url && oldSettings.company_favicon_url.startsWith('/uploads/favicons/')) {
                const oldPath = path.join(process.cwd(), 'public', oldSettings.company_favicon_url);
                if (fs.existsSync(oldPath)) {
                    try {
                        fs.unlinkSync(oldPath);
                    } catch (e) {
                        logger.error('Failed to delete old favicon:', e);
                    }
                }
            }

            const update = db.prepare(`
                UPDATE settings
                SET company_favicon_url = ?
                WHERE id = 1
            `);

            update.run(faviconUrl);

            const updatedSettings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
            logAudit('settings', 1, 'UPDATE', req.user!.id, oldSettings, updatedSettings);
            return updatedSettings;
        });

        const updatedSettings = updateTransaction();
        if (!updatedSettings) {
             res.status(404).json({ error: 'Settings not found' });
             return;
        }

        setSettingsCache(updatedSettings);
        res.json({ message: 'Favicon uploaded successfully', settings: updatedSettings });
    } catch (error) {
        logger.error('Error uploading favicon:', error);
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
            // Allow explicit update of the new fields even if oldSettings doesn't have them natively yet (due to cache or legacy rows)
            const allowedExtraKeys = [
                'wifi_validation_toggle', 'company_wifi_ssid', 'company_wifi_bssid',
                'min_clock_session_minutes', 'min_unscheduled_session_minutes'
            ];
            const keys = Object.keys(body).filter(k =>
                (Object.hasOwn(oldSettings, k) || allowedExtraKeys.includes(k)) &&
                k !== 'id' && k !== 'created_at' && k !== 'updated_at'
            );
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

            const updatedSettings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
            logAudit('settings', 1, 'UPDATE', req.user!.id, oldSettings, updatedSettings);

            // Auto-approve pending late/early-leave requests if grace period increased
            if (updatedSettings.late_grace_period !== oldSettings.late_grace_period) {
                const newGrace = updatedSettings.late_grace_period;
                const pendingRequests = db.prepare(`
                    SELECT * FROM requests 
                    WHERE status = 'pending' 
                      AND type IN ('late_in_approval', 'early_leave_approval') 
                      AND value <= ?
                `).all(newGrace) as any[];

                for (const r of pendingRequests) {
                    db.prepare(`
                        UPDATE requests 
                        SET status = 'approved', 
                            manager_note = 'Auto-approved: within new late grace period.' 
                        WHERE id = ?
                    `).run(r.id);

                    if (r.attendance_id) {
                        if (r.type === 'late_in_approval') {
                            db.prepare("UPDATE attendance SET checkin_status = 'on_time' WHERE id = ?").run(r.attendance_id);
                        } else if (r.type === 'early_leave_approval') {
                            db.prepare("UPDATE attendance SET checkout_status = 'on_time' WHERE id = ?").run(r.attendance_id);
                        }
                        const att = db.prepare("SELECT date FROM attendance WHERE id = ?").get(r.attendance_id) as any;
                        if (att) {
                            recalculateUserDailyAttendance(r.user_id, att.date);
                        }
                    }
                }
            }

            return updatedSettings;
        });

        const updatedSettings = updateTransaction();
        if (!updatedSettings) {
             res.status(404).json({ error: 'Settings not found' });
             return;
        }
        setSettingsCache(updatedSettings);
        res.json(updatedSettings);
    } catch (error) {
        logger.error('Error updating settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

export const uploadLogo = (req: AuthRequest, res: Response): void => {
    try {
        if (!req.file) {
            res.status(400).json({ error: 'No file uploaded' });
            return;
        }

        const logoUrl = `/uploads/logos/${req.file.filename}`;

        const updateTransaction = db.transaction(() => {
            const oldSettings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;

            if (!oldSettings) {
                // Should never happen since settings row is guaranteed, but handle gracefully
                return null;
            }

            // If there's an old logo, we could delete it here to save space
            if (oldSettings.company_logo_url && oldSettings.company_logo_url.startsWith('/uploads/logos/')) {
                const oldPath = path.join(process.cwd(), 'public', oldSettings.company_logo_url);
                if (fs.existsSync(oldPath)) {
                    try {
                        fs.unlinkSync(oldPath);
                    } catch (e) {
                        logger.error('Failed to delete old logo:', e);
                    }
                }
            }

            const update = db.prepare(`
                UPDATE settings
                SET company_logo_url = ?
                WHERE id = 1
            `);

            update.run(logoUrl);

            const updatedSettings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
            logAudit('settings', 1, 'UPDATE', req.user!.id, oldSettings, updatedSettings);
            return updatedSettings;
        });

        const updatedSettings = updateTransaction();
        if (!updatedSettings) {
             res.status(404).json({ error: 'Settings not found' });
             return;
        }

        setSettingsCache(updatedSettings);
        res.json({ message: 'Logo uploaded successfully', settings: updatedSettings });
    } catch (error) {
        logger.error('Error uploading logo:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
