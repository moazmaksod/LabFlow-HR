import Database from 'better-sqlite3';

const db = new Database(':memory:');

db.exec(`
    CREATE TABLE shift_interruptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        attendance_id INTEGER,
        start_time TEXT,
        end_time TEXT
    );
`);

const NUM_BREAKS = 500;
const ATTENDANCE_ID = 1;

// Prepare data
const breaks: any[] = [];
const insertStmt = db.prepare('INSERT INTO shift_interruptions (attendance_id, start_time, end_time) VALUES (?, ?, ?)');
for (let i = 1; i <= NUM_BREAKS; i++) {
    insertStmt.run(ATTENDANCE_ID, '2023-01-01T10:00:00Z', '2023-01-01T10:15:00Z');
    breaks.push({
        id: i,
        start_time: `2023-01-01T10:${(i % 60).toString().padStart(2, '0')}:00Z`,
        end_time: `2023-01-01T10:${((i + 15) % 60).toString().padStart(2, '0')}:00Z`
    });
}

// 1. Baseline: Loop approach
function benchmarkBaseline() {
    const updateBreakStmt = db.prepare(`
        UPDATE shift_interruptions
        SET start_time = COALESCE(?, start_time),
            end_time = COALESCE(?, end_time)
        WHERE id = ? AND attendance_id = ?
    `);

    const start = process.hrtime.bigint();
    const transaction = db.transaction(() => {
        for (const b of breaks) {
            updateBreakStmt.run(b.start_time || null, b.end_time || null, b.id, ATTENDANCE_ID);
        }
    });
    transaction();
    const end = process.hrtime.bigint();
    return Number(end - start) / 1e6; // Convert to ms
}

// 2. Optimized: CASE statement approach
function benchmarkOptimized() {
    const start = process.hrtime.bigint();

    const transaction = db.transaction(() => {
        if (breaks.length === 0) return;

        let startCase = 'CASE id ';
        let endCase = 'CASE id ';
        const ids = [];
        const startParams: any[] = [];
        const endParams: any[] = [];
        const idParams: any[] = [];

        for (const b of breaks) {
            startCase += 'WHEN ? THEN COALESCE(?, start_time) ';
            startParams.push(b.id, b.start_time || null);

            endCase += 'WHEN ? THEN COALESCE(?, end_time) ';
            endParams.push(b.id, b.end_time || null);

            ids.push(b.id);
            idParams.push('?');
        }

        startCase += 'END';
        endCase += 'END';

        const query = `
            UPDATE shift_interruptions
            SET start_time = ${startCase},
                end_time = ${endCase}
            WHERE attendance_id = ? AND id IN (${idParams.join(', ')})
        `;

        // Combine parameters: start_time params, end_time params, attendance_id, IN clause ids
        const finalParams = [...startParams, ...endParams, ATTENDANCE_ID, ...ids];

        db.prepare(query).run(...finalParams);
    });

    transaction();

    const end = process.hrtime.bigint();
    return Number(end - start) / 1e6; // Convert to ms
}

// Warm up
for (let i=0; i<10; i++) {
    benchmarkBaseline();
    benchmarkOptimized();
}

// Run benchmarks
const iterations = 100;

let totalBaselineMs = 0;
let totalOptimizedMs = 0;

for (let i=0; i<iterations; i++) {
    totalBaselineMs += benchmarkBaseline();
    totalOptimizedMs += benchmarkOptimized();
}

const avgBaselineMs = totalBaselineMs / iterations;
const avgOptimizedMs = totalOptimizedMs / iterations;

console.log(`--- Benchmark Results (N=${NUM_BREAKS} breaks) ---`);
console.log(`Baseline (Loop within Transaction): ${avgBaselineMs.toFixed(3)} ms (${(avgBaselineMs / NUM_BREAKS * 1000).toFixed(2)} µs/row)`);
console.log(`Optimized (CASE Statement):       ${avgOptimizedMs.toFixed(3)} ms (${(avgOptimizedMs / NUM_BREAKS * 1000).toFixed(2)} µs/row)`);

const improvement = ((avgBaselineMs - avgOptimizedMs) / avgBaselineMs) * 100;
console.log(`Improvement: ${improvement.toFixed(2)}%`);

db.close();
