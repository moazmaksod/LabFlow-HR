import db from '../db/index.js';
import logger from '../utils/logger.js';
import { getAppNow } from "../utils/timeManager.js";

export function generateShiftInstances(userId: number, weeklyScheduleRaw: any): void {
    logger.debug(`generateShiftInstances triggered for user ${userId}`);

    if (!weeklyScheduleRaw) {
        logger.debug(`Aborting: No weeklyScheduleRaw provided for user ${userId}`);
        return;
    }

    let schedule: Record<string, { start: string; end: string }[]> | null = null;
    try {
        // STRICT FIX: Safely handle both String and Object payloads coming from the controller
        schedule = typeof weeklyScheduleRaw === 'string' ? JSON.parse(weeklyScheduleRaw) : weeklyScheduleRaw;
    } catch (e) {
        logger.error(`CRITICAL: Failed to parse schedule for user ${userId}:`, e);
        return;
    }

    if (!schedule || Object.keys(schedule).length === 0) {
        logger.debug(`Aborting: Parsed schedule is empty for user ${userId}`);
        return;
    }

    // Since the frontend now explicitly converts shift times to UTC before saving,
    // we evaluate logical dates and shift times directly in UTC.
    const now = new Date(getAppNow());
    const localNow = new Date(now.getTime()); // we just use UTC now as the anchor

    try {
        const generateTransaction = db.transaction(() => {
            // 1. Clean up future scheduled shifts
            db.prepare(`
                DELETE FROM shift_instances
                WHERE user_id = ? AND status = 'Scheduled' AND start_time > ?
            `).run(userId, now.toISOString());

            const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
            const insertStmt = db.prepare(`
                INSERT INTO shift_instances (user_id, start_time, end_time, logical_date, status)
                VALUES (?, ?, ?, ?, 'Scheduled')
            `);

            let insertedCount = 0;

            // 2. Generate exactly 30 days into the future
            for (let offset = 0; offset <= 30; offset++) {
                const d = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() + offset));
                const dayName = daysOfWeek[d.getUTCDay()];
                const logicalDateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

                const daySchedule = schedule![dayName];
                if (Array.isArray(daySchedule)) {
                    daySchedule.forEach(shift => {
                        const [startH, startM] = shift.start.split(':').map(Number);
                        const [endH, endM] = shift.end.split(':').map(Number);

                        const shiftStartUTC = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), startH, startM, 0));
                        const shiftEndUTC = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), endH, endM, 0));

                        // Midnight crossing fix
                        if (endH < startH || (endH === startH && endM < startM)) {
                            shiftEndUTC.setUTCDate(shiftEndUTC.getUTCDate() + 1);
                        }

                        // CRITICAL LOGICAL FIX: Check if the shift ENDS in the future, not just starts.
                        if (shiftEndUTC > now) {
                            insertStmt.run(userId, shiftStartUTC.toISOString(), shiftEndUTC.toISOString(), logicalDateStr);
                            insertedCount++;
                        }
                    });
                }
            }
            logger.info(`Generated ${insertedCount} shift instances for user ${userId} in the database.`);
        });

        generateTransaction();
    } catch (err) {
        logger.error(`CRITICAL: DB Transaction completely failed for user ${userId}:`, err);
    }
}
