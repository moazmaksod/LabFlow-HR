import db, { initDb } from '../db/index.js';
import { generateShiftInstances } from '../services/shiftInstanceService.js';

function seedShiftInstances() {
    initDb();
    console.log('Starting Shift Instances Migration...');

    try {
        const settings = db.prepare('SELECT company_timezone FROM settings WHERE id = 1').get() as any;
        const timezone = settings?.company_timezone || 'UTC';
        console.log(`Using company timezone: ${timezone}`);

        const profiles = db.prepare('SELECT user_id, weekly_schedule FROM profiles WHERE weekly_schedule IS NOT NULL AND status != \'inactive\' AND status != \'suspended\'').all() as any[];
        console.log(`Found ${profiles.length} active profiles with a weekly schedule.`);

        let successCount = 0;
        let errorCount = 0;

        for (const profile of profiles) {
            try {
                const schedStr = typeof profile.weekly_schedule === 'string'
                    ? profile.weekly_schedule
                    : JSON.stringify(profile.weekly_schedule);

                generateShiftInstances(profile.user_id, schedStr, timezone);
                successCount++;
                console.log(`[SUCCESS] Generated shifts for user ${profile.user_id}`);
            } catch (err) {
                console.error(`[ERROR] Failed to generate shifts for user ${profile.user_id}:`, err);
                errorCount++;
            }
        }

        console.log('--- Migration Complete ---');
        console.log(`Total Profiles Processed: ${profiles.length}`);
        console.log(`Successfully Migrated: ${successCount}`);
        console.log(`Failed Migrations: ${errorCount}`);
    } catch (globalErr) {
        console.error('Critical failure during migration:', globalErr);
    } finally {
        // Only close if not running in memory
        if (process.env.DB_PATH !== ':memory:') {
           db.close();
        }
    }
}

// Execute the migration
seedShiftInstances();
