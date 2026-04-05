import db, { initDb } from '../../db/index.js';
import { generateShiftInstances } from '../../services/shiftInstanceService.js';

let testUserId: number | bigint;

beforeAll(() => {
    initDb();

    // Insert a dummy user and job
    db.prepare(`INSERT INTO jobs (id, title, hourly_rate, required_hours, grace_period) VALUES (1, 'Test Job', 20, 8, 15)`).run();
    const empInsert = db.prepare(`INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)`).run('Test User', 'test@test.com', 'hash', 'employee');
    testUserId = empInsert.lastInsertRowid;
    db.prepare(`INSERT INTO profiles (user_id, status, job_id, weekly_schedule, device_id) VALUES (?, ?, ?, ?, ?)`).run(testUserId, 'active', 1, null, 'test-device');
});

afterAll(() => {
    db.close();
});

beforeEach(() => {
    db.prepare('DELETE FROM shift_instances').run();
});

describe('Shift Generation Service', () => {

    it('should generate standard shifts for 30 days', () => {
        const schedule = JSON.stringify({
            monday: [{ start: "09:00", end: "17:00" }],
            tuesday: [{ start: "09:00", end: "17:00" }]
        });

        // UTC testing
        generateShiftInstances(Number(testUserId), schedule, 'UTC');

        const instances = db.prepare('SELECT * FROM shift_instances WHERE user_id = ? ORDER BY start_time ASC').all(testUserId) as any[];

        // Expect around 8-10 shifts depending on the day of the week
        expect(instances.length).toBeGreaterThan(0);

        // Verify the duration of the first shift is 8 hours
        const firstShift = instances[0];
        const start = new Date(firstShift.start_time);
        const end = new Date(firstShift.end_time);
        const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

        expect(diffHours).toBe(8);
        expect(firstShift.status).toBe('Scheduled');
    });

    it('should correctly handle the Midnight Handling edgecase (Night Shift)', () => {
        const schedule = JSON.stringify({
            wednesday: [{ start: "17:00", end: "05:00" }] // 5 PM to 5 AM next day
        });

        generateShiftInstances(Number(testUserId), schedule, 'America/New_York');

        const instances = db.prepare('SELECT * FROM shift_instances WHERE user_id = ? ORDER BY start_time ASC').all(testUserId) as any[];

        expect(instances.length).toBeGreaterThan(0);

        // Take one instance to verify
        const firstShift = instances[0];

        const start = new Date(firstShift.start_time);
        const end = new Date(firstShift.end_time);
        const diffHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

        // Duration should be 12 hours
        expect(diffHours).toBe(12);

        // In America/New_York, 5 PM is 21:00 UTC (or 22:00 depending on DST), and 5 AM is 09:00 UTC (or 10:00).
        // The most important part is that the end date is the day AFTER the start date locally.
        // We can verify this via the 12-hour difference.

        // Also verify the logical_date matches the START day, not the end day.
        // The logical date string should match the start time's local representation.
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone: 'America/New_York',
            year: 'numeric', month: '2-digit', day: '2-digit'
        });
        const parts = formatter.formatToParts(start);
        const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
        const expectedLogicalDateStr = `${getPart('year')}-${getPart('month')}-${getPart('day')}`;

        expect(firstShift.logical_date).toBe(expectedLogicalDateStr);
    });

});
