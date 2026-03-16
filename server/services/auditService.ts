import db from '../db/index.js';

export const logAudit = (
    entityName: string,
    entityId: number,
    action: string,
    actorId: number | null, // null means 'System'
    oldValues: any = null,
    newValues: any = null
) => {
    try {
        db.prepare(`
            INSERT INTO audit_logs (entity_name, entity_id, action, actor_id, old_values, new_values)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(
            entityName,
            entityId,
            action,
            actorId,
            oldValues ? JSON.stringify(oldValues) : null,
            newValues ? JSON.stringify(newValues) : null
        );
    } catch (error) {
        console.error('Failed to write audit log:', error);
    }
};
