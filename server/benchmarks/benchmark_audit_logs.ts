import { performance } from 'perf_hooks';

// Mock data generator
const generateLogs = (count: number) => {
    const logs = [];
    for (let i = 0; i < count; i++) {
        logs.push({
            id: i,
            entity_name: 'User',
            entity_id: i,
            action: 'UPDATE',
            actor_id: 1,
            old_values: JSON.stringify({ name: 'Old Name ' + i, email: 'old' + i + '@example.com', role: 'employee' }),
            new_values: JSON.stringify({ name: 'New Name ' + i, email: 'new' + i + '@example.com', role: 'manager' }),
            created_at: new Date().toISOString(),
            actor_name: 'Admin',
            actor_email: 'admin@example.com'
        });
    }
    return logs;
};

const count = 10000;
const iterations = 100;

function slowImplementation(logs: any[]) {
    return logs.map((log: any) => ({
        ...log,
        old_values: log.old_values ? JSON.parse(log.old_values) : null,
        new_values: log.new_values ? JSON.parse(log.new_values) : null
    }));
}

function fastImplementation(logs: any[]) {
    const len = logs.length;
    for (let i = 0; i < len; i++) {
        const log = logs[i];
        if (log.old_values) log.old_values = JSON.parse(log.old_values);
        if (log.new_values) log.new_values = JSON.parse(log.new_values);
    }
    return logs;
}

// Warm up
const warmUpLogs = generateLogs(100);
for (let i = 0; i < 100; i++) {
    slowImplementation(JSON.parse(JSON.stringify(warmUpLogs)));
    fastImplementation(JSON.parse(JSON.stringify(warmUpLogs)));
}

console.log(`Benchmarking with ${count} logs and ${iterations} iterations...`);

let totalSlowTime = 0;
for (let i = 0; i < iterations; i++) {
    const logs = generateLogs(count);
    const start = performance.now();
    slowImplementation(logs);
    totalSlowTime += (performance.now() - start);
}
console.log(`Slow implementation average: ${(totalSlowTime / iterations).toFixed(2)} ms`);

let totalFastTime = 0;
for (let i = 0; i < iterations; i++) {
    const logs = generateLogs(count);
    const start = performance.now();
    fastImplementation(logs);
    totalFastTime += (performance.now() - start);
}
console.log(`Fast implementation average: ${(totalFastTime / iterations).toFixed(2)} ms`);

const improvement = (totalSlowTime - totalFastTime) / totalSlowTime * 100;
console.log(`Improvement: ${improvement.toFixed(2)}%`);
