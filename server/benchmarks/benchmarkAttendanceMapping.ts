import { performance } from 'perf_hooks';

const NUM_LOGS = 1000;
const NUM_BREAKS = 3000;
const NUM_REQUESTS = 3000;

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

// 1. Slow approach (Current)
const slowLogs = JSON.parse(JSON.stringify(logs)); // Deep copy to ensure fresh object
const startSlow = performance.now();

slowLogs.forEach((log: any) => {
    log.breaks = breaks.filter(b => b.attendance_id === log.id);
    log.requests = requests.filter(r => r.attendance_id === log.id);
});

const endSlow = performance.now();
const slowTime = endSlow - startSlow;
console.log(`Baseline (O(N*M)): ${slowTime.toFixed(3)} ms`);

// 2. Fast approach (Map)
const fastLogs = JSON.parse(JSON.stringify(logs));
const startFast = performance.now();

const breaksMap = new Map<number, any[]>();
for (let i = 0; i < breaks.length; i++) {
    const b = breaks[i];
    const arr = breaksMap.get(b.attendance_id);
    if (arr) {
        arr.push(b);
    } else {
        breaksMap.set(b.attendance_id, [b]);
    }
}

const requestsMap = new Map<number, any[]>();
for (let i = 0; i < requests.length; i++) {
    const r = requests[i];
    const arr = requestsMap.get(r.attendance_id);
    if (arr) {
        arr.push(r);
    } else {
        requestsMap.set(r.attendance_id, [r]);
    }
}

for (let i = 0; i < fastLogs.length; i++) {
    const log = fastLogs[i];
    log.breaks = breaksMap.get(log.id) || [];
    log.requests = requestsMap.get(log.id) || [];
}

const endFast = performance.now();
const fastTime = endFast - startFast;
console.log(`Optimized (O(N+M)): ${fastTime.toFixed(3)} ms`);

// Calculate improvement
const improvement = ((slowTime - fastTime) / slowTime) * 100;
console.log(`Improvement: ${improvement.toFixed(2)}%`);

// Correctness check
let correct = true;
for (let i = 0; i < NUM_LOGS; i++) {
    if (slowLogs[i].breaks.length !== fastLogs[i].breaks.length) {
        correct = false;
        console.error(`Mismatch in breaks for log ${slowLogs[i].id}: Slow(${slowLogs[i].breaks.length}) vs Fast(${fastLogs[i].breaks.length})`);
        break;
    }
    if (slowLogs[i].requests.length !== fastLogs[i].requests.length) {
        correct = false;
        console.error(`Mismatch in requests for log ${slowLogs[i].id}: Slow(${slowLogs[i].requests.length}) vs Fast(${fastLogs[i].requests.length})`);
        break;
    }
}
console.log(`Correctness Check: ${correct ? 'PASS' : 'FAIL'}`);
