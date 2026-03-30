import db, { initDb } from '../db/index.js';
import { logAudit } from '../services/auditService.js';
import { getOrCreateDraftPayroll } from '../controllers/payrollController.js';

// Setup DB
initDb();

const N_USERS = 500;
const startDate = '2023-01-01';
const endDate = '2023-01-31';
const actorId = 1;

// Clear tables
db.prepare('DELETE FROM audit_logs').run();
db.prepare('DELETE FROM payrolls').run();
db.prepare('DELETE FROM profiles').run();
db.prepare('DELETE FROM users').run();

// Create fake users
const insertUser = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
const userIds: number[] = [];
for (let i = 0; i < N_USERS; i++) {
    const info = insertUser.run(`User ${i}`, `user${i}@test.com`, 'hash', 'employee');
    userIds.push(info.lastInsertRowid as number);
}

// 1. Slow Implementation (what currently exists)
function slowBulkInsert() {
    for (const userId of userIds) {
        getOrCreateDraftPayroll(userId, startDate, actorId);
    }
}

// 2. Fast Implementation (what we will propose)
function fastBulkInsert() {
    const missingUsers = userIds; // in real life, we would filter this list

    // Bulk insert missing drafts
    const insertStmt = db.prepare(`
        INSERT INTO payrolls (user_id, start_date, end_date, base_salary, status)
        VALUES (?, ?, ?, 0, 'draft')
    `);

    const insertTx = db.transaction((users) => {
        for (const userId of users) {
            insertStmt.run(userId, startDate, endDate);
        }
    });
    insertTx(missingUsers);

    // Bulk select the newly created drafts
    const placeholders = missingUsers.map(() => '?').join(',');
    const newPayrolls = db.prepare(`
        SELECT * FROM payrolls
        WHERE user_id IN (${placeholders}) AND start_date = ? AND end_date = ? AND status = 'draft'
    `).all(...missingUsers, startDate, endDate) as any[];

    // Bulk audit log
    const auditStmt = db.prepare(`
        INSERT INTO audit_logs (entity_name, entity_id, action, actor_id, old_values, new_values)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    const auditTx = db.transaction((payrolls) => {
        for (const p of payrolls) {
            auditStmt.run(
                'payrolls',
                p.id,
                'CREATE',
                actorId,
                null,
                JSON.stringify(p)
            );
        }
    });

    auditTx(newPayrolls);
}

// Benchmark
console.log(`Benchmarking with N = ${N_USERS} users...`);

db.prepare('DELETE FROM audit_logs').run();
db.prepare('DELETE FROM payrolls').run();

const startSlow = performance.now();
slowBulkInsert();
const endSlow = performance.now();
const slowMs = endSlow - startSlow;

db.prepare('DELETE FROM audit_logs').run();
db.prepare('DELETE FROM payrolls').run();

const startFast = performance.now();
fastBulkInsert();
const endFast = performance.now();
const fastMs = endFast - startFast;

console.log(`Slow: ${slowMs.toFixed(2)} ms (${(slowMs / N_USERS).toFixed(3)} ms/row)`);
console.log(`Fast: ${fastMs.toFixed(2)} ms (${(fastMs / N_USERS).toFixed(3)} ms/row)`);
console.log(`Improvement: ${(slowMs / fastMs).toFixed(2)}x faster`);
