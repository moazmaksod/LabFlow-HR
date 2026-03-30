import { performance } from 'perf_hooks';
import db, { initDb } from '../db/index.js';
import { getSettingsCache, setSettingsCache, clearSettingsCache } from '../utils/cache.js';

// Initialize the DB to make sure 'settings' table exists
initDb();

function getSettingsSlow() {
    return db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
}

function getSettingsFast() {
    let settings = getSettingsCache();
    if (!settings) {
        settings = db.prepare('SELECT * FROM settings WHERE id = 1').get() as any;
        setSettingsCache(settings);
    }
    return settings;
}

const ITERATIONS = 10000;

console.log(`Running baseline benchmark with ${ITERATIONS} iterations...`);

// Warmup
for (let i = 0; i < 100; i++) {
    getSettingsSlow();
}

const startSlow = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    getSettingsSlow();
}
const endSlow = performance.now();
const timeSlow = endSlow - startSlow;

console.log(`[Slow] Database Query: ${timeSlow.toFixed(2)} ms (${(timeSlow / ITERATIONS * 1000).toFixed(2)} µs/op)`);

// Warmup
clearSettingsCache();
for (let i = 0; i < 100; i++) {
    getSettingsFast();
}

const startFast = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
    getSettingsFast();
}
const endFast = performance.now();
const timeFast = endFast - startFast;

console.log(`[Fast] Cached Query: ${timeFast.toFixed(2)} ms (${(timeFast / ITERATIONS * 1000).toFixed(2)} µs/op)`);
console.log(`Speedup: ${(timeSlow / timeFast).toFixed(2)}x faster`);
