import { performance } from 'perf_hooks';
import db from '../db/index.js';
import { initDb } from '../db/index.js';

// Initialize the database before doing anything
initDb();

const N = 5000;

function slowFetch() {
    const settingsForTz = db.prepare('SELECT company_timezone FROM settings WHERE id = 1').get() as any;
    return settingsForTz?.company_timezone || 'UTC';
}

let cachedTz: string | null = null;
let tzExpiry = 0;

function fastFetch() {
    const now = Date.now();
    if (cachedTz && now < tzExpiry) return cachedTz;

    const settings = db.prepare('SELECT company_timezone FROM settings WHERE id = 1').get() as any;
    cachedTz = settings?.company_timezone || 'UTC';
    tzExpiry = now + 5 * 60 * 1000;
    return cachedTz;
}

console.log('Running benchmark for Timezone Cache...');
console.log(`Iterations: ${N}`);

// Warmup
for (let i = 0; i < 100; i++) {
    slowFetch();
    fastFetch();
}

// Slow benchmark
const startSlow = performance.now();
for (let i = 0; i < N; i++) {
    slowFetch();
}
const endSlow = performance.now();
const timeSlow = endSlow - startSlow;

// Fast benchmark
const startFast = performance.now();
for (let i = 0; i < N; i++) {
    fastFetch();
}
const endFast = performance.now();
const timeFast = endFast - startFast;

console.log(`\nSlow (DB Query): ${timeSlow.toFixed(2)}ms (${(timeSlow / N * 1000).toFixed(2)}µs/call)`);
console.log(`Fast (Memory Cache): ${timeFast.toFixed(2)}ms (${(timeFast / N * 1000).toFixed(2)}µs/call)`);
console.log(`Improvement: ${(timeSlow / timeFast).toFixed(2)}x faster`);
