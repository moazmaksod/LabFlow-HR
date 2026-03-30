// benchmarkAttendanceMapping.ts
import process from 'process';

const NUM_LOGS = 1000;
const NUM_BREAKS = 3000;
const NUM_REQUESTS = 3000;

// Setup mock data
const logs: any[] = [];
for (let i = 1; i <= NUM_LOGS; i++) {
    logs.push({ id: i });
}

const breaks: any[] = [];
for (let i = 1; i <= NUM_BREAKS; i++) {
    breaks.push({ attendance_id: Math.floor(Math.random() * NUM_LOGS) + 1 });
}

const requests: any[] = [];
for (let i = 1; i <= NUM_REQUESTS; i++) {
    requests.push({ attendance_id: Math.floor(Math.random() * NUM_LOGS) + 1 });
}

// 1. Baseline: Filter inside forEach (O(N*M))
function benchmarkBaseline() {
    // Create deep copies to avoid modifying the original array if it mutates
    const logsCopy = logs.map(l => ({ ...l }));
    const start = process.hrtime.bigint();

    logsCopy.forEach(log => {
        log.breaks = breaks.filter(b => b.attendance_id === log.id);
        log.requests = requests.filter(r => r.attendance_id === log.id);
    });

    const end = process.hrtime.bigint();
    return Number(end - start) / 1e6; // Convert to ms
}

// 2. Optimized: Map approach (O(N+M))
function benchmarkOptimized() {
    const logsCopy = logs.map(l => ({ ...l }));
    const start = process.hrtime.bigint();

    // Group breaks
    const breaksByAttendanceId = new Map<number, any[]>();
    for (const b of breaks) {
        if (!breaksByAttendanceId.has(b.attendance_id)) {
            breaksByAttendanceId.set(b.attendance_id, []);
        }
        breaksByAttendanceId.get(b.attendance_id)!.push(b);
    }

    // Group requests
    const requestsByAttendanceId = new Map<number, any[]>();
    for (const r of requests) {
        if (!requestsByAttendanceId.has(r.attendance_id)) {
            requestsByAttendanceId.set(r.attendance_id, []);
        }
        requestsByAttendanceId.get(r.attendance_id)!.push(r);
    }

    logsCopy.forEach(log => {
        log.breaks = breaksByAttendanceId.get(log.id) || [];
        log.requests = requestsByAttendanceId.get(log.id) || [];
    });

    const end = process.hrtime.bigint();
    return Number(end - start) / 1e6; // Convert to ms
}

// Warm up
for (let i = 0; i < 10; i++) {
    benchmarkBaseline();
    benchmarkOptimized();
}

// Run benchmarks
const iterations = 100;

let totalBaselineMs = 0;
let totalOptimizedMs = 0;

for (let i = 0; i < iterations; i++) {
    totalBaselineMs += benchmarkBaseline();
    totalOptimizedMs += benchmarkOptimized();
}

const avgBaselineMs = totalBaselineMs / iterations;
const avgOptimizedMs = totalOptimizedMs / iterations;

console.log(`--- Benchmark Results (Logs: ${NUM_LOGS}, Breaks: ${NUM_BREAKS}, Requests: ${NUM_REQUESTS}) ---`);
console.log(`Baseline (O(N*M)):       ${avgBaselineMs.toFixed(3)} ms`);
console.log(`Optimized (Map O(N+M)):  ${avgOptimizedMs.toFixed(3)} ms`);

const improvement = ((avgBaselineMs - avgOptimizedMs) / avgBaselineMs) * 100;
console.log(`Improvement: ${improvement.toFixed(2)}%`);
