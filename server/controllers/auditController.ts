import { Request, Response } from 'express';
import db from '../db/index.js';

export const getAuditLogs = (req: Request, res: Response): void => {
    try {
        const { entity_name, entity_id, actor_id, start_date, end_date, limit = 100, offset = 0 } = req.query;

        let query = `
            SELECT a.*, u.name as actor_name, u.email as actor_email
            FROM audit_logs a
            LEFT JOIN users u ON a.actor_id = u.id
            WHERE 1=1
        `;
        const params: any[] = [];

        if (entity_name) {
            query += ' AND a.entity_name = ?';
            params.push(entity_name);
        }
        if (entity_id) {
            query += ' AND a.entity_id = ?';
            params.push(entity_id);
        }
        if (actor_id) {
            query += ' AND a.actor_id = ?';
            params.push(actor_id);
        }
        if (start_date) {
            query += ' AND a.created_at >= ?';
            params.push(start_date);
        }
        if (end_date) {
            query += ' AND a.created_at <= ?';
            params.push(end_date);
        }

        query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
        params.push(Number(limit), Number(offset));

        const logs = db.prepare(query).all(...params);

        // Parse JSON strings back to objects for the response
        const len = logs.length;
        for (let i = 0; i < len; i++) {
            const log = logs[i];
            if (log.old_values) log.old_values = JSON.parse(log.old_values);
            if (log.new_values) log.new_values = JSON.parse(log.new_values);
        }

        res.json(logs);
    } catch (error) {
        console.error('Error fetching audit logs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
