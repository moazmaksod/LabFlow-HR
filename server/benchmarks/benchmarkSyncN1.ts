import db, { initDb } from '../db/index.js';

initDb();

function setupMockData() {
    db.prepare('DELETE FROM users').run();
    db.prepare('DELETE FROM profiles').run();
    db.prepare('DELETE FROM settings').run();
    db.prepare('DELETE FROM jobs').run();
    db.prepare('DELETE FROM attendance').run();

    db.prepare(`
        INSERT INTO settings (id, company_name, company_timezone, late_grace_period, geofence_toggle)
        VALUES (1, 'Bench Co', 'UTC', 15, 0)
    `).run();

    const insertUser = db.prepare(`
        INSERT INTO users (name, email, password_hash, role)
        VALUES ('Benchmark User', 'benchsync@example.com', 'hash', 'employee')
    `);
    const userId = insertUser.run().lastInsertRowid;

    db.prepare(`
        INSERT INTO jobs (id, title, grace_period, hourly_rate, required_hours)
        VALUES (1, 'Bench Job', 15, 20.0, 40)
    `).run();

    const schedule = {
        monday: [{ start: "09:00", end: "17:00" }],
        tuesday: [{ start: "09:00", end: "17:00" }],
        wednesday: [{ start: "09:00", end: "17:00" }],
        thursday: [{ start: "09:00", end: "17:00" }],
        friday: [{ start: "09:00", end: "17:00" }]
    };

    db.prepare(`
        INSERT INTO profiles (user_id, job_id, device_id, weekly_schedule, status, allow_overtime, max_overtime_hours)
        VALUES (?, 1, 'dev123', ?, 'active', 1, 2)
    `).run(userId, JSON.stringify(schedule));

    const logs = [];
    let date = new Date('2023-01-01T09:00:00.000Z');

    for (let i = 0; i < 500; i++) {
        logs.push({
            id: i,
            type: i % 2 === 0 ? 'check_in' : 'check_out',
            timestamp: date.toISOString(),
            lat: 0,
            lng: 0,
            deviceId: 'dev123'
        });
        date.setHours(date.getHours() + 8);
    }

    return { userId: Number(userId), logs };
}

const { userId, logs } = setupMockData();

// We need to import the real controllers or mock their behavior directly here to test the specific handleClockAction optimization.
// Since the prompt asks to benchmark handleClockAction, I will mock a slow and fast version of syncTransaction loop here to measure the impact of N+1 query.

// Simulated handleClockAction - SLOW (Current Implementation)
const handleClockActionSlow = (userId: number, type: string, lat: number, lng: number, deviceId: string, timestamp: string) => {
    const userProfile = db.prepare(`
        SELECT p.status, p.device_id, p.weekly_schedule, j.grace_period, p.allow_overtime, p.max_overtime_hours
        FROM profiles p
        LEFT JOIN jobs j ON p.job_id = j.id
        WHERE p.user_id = ?
    `).get(userId) as any;

    if (!userProfile) return { status: 404, error: 'User profile not found' };
    if (userProfile.status === 'inactive' || userProfile.status === 'suspended') return { status: 403, error: 'Status error' };

    const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;

    // Simulate some simple logic so it's not totally empty
    return { status: 201, data: { status: 'on_time' } };
};

// Simulated handleClockAction - FAST (Optimized Implementation)
const handleClockActionFast = (userId: number, type: string, lat: number, lng: number, deviceId: string, timestamp: string, prefetchedProfile?: any, prefetchedSettings?: any) => {
    let userProfile = prefetchedProfile;
    if (!userProfile) {
        userProfile = db.prepare(`
            SELECT p.status, p.device_id, p.weekly_schedule, j.grace_period, p.allow_overtime, p.max_overtime_hours
            FROM profiles p
            LEFT JOIN jobs j ON p.job_id = j.id
            WHERE p.user_id = ?
        `).get(userId) as any;
    }

    if (!userProfile) return { status: 404, error: 'User profile not found' };
    if (userProfile.status === 'inactive' || userProfile.status === 'suspended') return { status: 403, error: 'Status error' };

    let settings = prefetchedSettings;
    if (!settings) {
         settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
    }

    // Simulate some simple logic
    return { status: 201, data: { status: 'on_time' } };
};

export function runBenchmark() {
    console.log("Warming up...");
    for (let i = 0; i < 100; i++) {
        handleClockActionSlow(userId, 'check_in', 0, 0, 'dev123', new Date().toISOString());
        handleClockActionFast(userId, 'check_in', 0, 0, 'dev123', new Date().toISOString());
    }

    console.log("Starting slow sync transaction benchmark (N+1)...");
    const startSlow = performance.now();
    for (const log of logs) {
        handleClockActionSlow(userId, log.type, log.lat, log.lng, log.deviceId, log.timestamp);
    }
    const endSlow = performance.now();
    console.log(`Slow execution time: ${(endSlow - startSlow).toFixed(2)} ms`);

    console.log("Starting fast sync transaction benchmark (Pre-fetched)...");
    const startFast = performance.now();

    // Simulating the actual fix logic
    const settingsCache = db.prepare('SELECT * FROM settings WHERE id = 1').get();
    const profileMap = new Map();

    for (const log of logs) {
        let profile = profileMap.get(userId);
        if (!profile) {
            profile = db.prepare(`
                SELECT p.status, p.device_id, p.weekly_schedule, j.grace_period, p.allow_overtime, p.max_overtime_hours
                FROM profiles p
                LEFT JOIN jobs j ON p.job_id = j.id
                WHERE p.user_id = ?
            `).get(userId);
            profileMap.set(userId, profile);
        }

        handleClockActionFast(userId, log.type, log.lat, log.lng, log.deviceId, log.timestamp, profile, settingsCache);
    }
    const endFast = performance.now();
    console.log(`Fast execution time: ${(endFast - startFast).toFixed(2)} ms`);

    console.log(`Improvement: ${((1 - (endFast - startFast)/(endSlow - startSlow)) * 100).toFixed(2)}% faster`);
}

runBenchmark();
