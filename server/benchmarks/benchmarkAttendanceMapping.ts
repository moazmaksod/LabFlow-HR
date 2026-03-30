import { performance } from 'perf_hooks';

// Benchmark Configuration
const NUM_LOGS = 1000;
const NUM_BREAKS = 3000;
const NUM_REQUESTS = 3000;
const ITERATIONS = 100;

console.log(`--- Benchmark Configuration ---`);
console.log(`Logs: ${NUM_LOGS}, Breaks: ${NUM_BREAKS}, Requests: ${NUM_REQUESTS}`);

// Generate mock data
const logs: any[] = [];
for (let i = 1; i <= NUM_LOGS; i++) {
    logs.push({ id: i });
}

const breaks: any[] = [];
for (let i = 1; i <= NUM_BREAKS; i++) {
    breaks.push({ id: i, attendance_id: Math.floor(Math.random() * NUM_LOGS) + 1 });
}

const requests: any[] = [];
for (let i = 1; i <= NUM_REQUESTS; i++) {
    requests.push({ id: i, attendance_id: Math.floor(Math.random() * NUM_LOGS) + 1 });
}

// 1. Slow approach: Baseline O(N*M) using nested .filter()
function benchmarkBaseline() {
    const logsCopy = JSON.parse(JSON.stringify(logs));
    const start = performance.now();

    logsCopy.forEach((log: any) => {
        log.breaks = breaks.filter(b => b.attendance_id === log.id);
        log.requests = requests.filter(r => r.attendance_id === log.id);
    });

    const end = performance.now();
    return end - start;
}

// 2. Fast approach: Optimized O(N+M) using Map hashing
function benchmarkOptimized() {
    const logsCopy = JSON.parse(JSON.stringify(logs));
    const start = performance.now();

    const breaksMap = new Map<number, any[]>();
    for (let i = 0; i < breaks.length; i++) {
        const b = breaks[i];
        if (!breaksMap.has(b.attendance_id)) {
            breaksMap.set(b.attendance_id, []);
        }
        breaksMap.get(b.attendance_id)!.push(b);
    }

    const requestsMap = new Map<number, any[]>();
    for (let i = 0; i < requests.length; i++) {
        const r = requests[i];
        if (!requestsMap.has(r.attendance_id)) {
            requestsMap.set(r.attendance_id, []);
        }
        requestsMap.get(r.attendance_id)!.push(r);
    }

    for (let i = 0; i < logsCopy.length; i++) {
        const log = logsCopy[i];
        log.breaks = breaksMap.get(log.id) || [];
        log.requests = requestsMap.get(log.id) || [];
    }

    const end = performance.now();
    return end - start;
}

// Warm up the engine to allow V8 optimizations
console.log("Warming up...");
for (let i = 0; i < 10; i++) {
    benchmarkBaseline();
    benchmarkOptimized();
}

// Execution
let totalBaselineMs = 0;
let totalOptimizedMs = 0;

for (let i = 0; i < ITERATIONS; i++) {
    totalBaselineMs += benchmarkBaseline();
    totalOptimizedMs += benchmarkOptimized();
}

const avgBaselineMs = totalBaselineMs / ITERATIONS;
const avgOptimizedMs = totalOptimizedMs / ITERATIONS;

console.log(`--- Benchmark Results (Average over ${ITERATIONS} runs) ---`);
console.log(`Baseline (O(N*M)):       ${avgBaselineMs.toFixed(3)} ms`);
console.log(`Optimized (Map O(N+M)):  ${avgOptimizedMs.toFixed(3)} ms`);

const improvement = ((avgBaselineMs - avgOptimizedMs) / avgBaselineMs) * 100;
console.log(`Improvement: ${improvement.toFixed(2)}%`);

// Final Correctness Check
const testSlow = logs.map(l => ({ ...l }));
const testFast = logs.map(l => ({ ...l }));

testSlow.forEach((log: any) => {
    log.breaks = breaks.filter(b => b.attendance_id === log.id);
});

const bMap = new Map();
breaks.forEach(b => {
    if (!bMap.has(b.attendance_id)) bMap.set(b.attendance_id, []);
    bMap.get(b.attendance_id).push(b);
});
testFast.forEach((log: any) => {
    log.breaks = bMap.get(log.id) || [];
});

const isCorrect = JSON.stringify(testSlow) === JSON.stringify(testFast);
console.log(`Correctness Check: ${isCorrect ? 'PASS ✅' : 'FAIL ❌'}`);