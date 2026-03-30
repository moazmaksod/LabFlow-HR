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

// Create admin user
const insertAdmin = db.prepare('INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)');
insertAdmin.run(actorId, 'Admin User', 'admin@test.com', 'admin_hash', 'manager');

// Create fake users
const insertUser = db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)');
const userIds: number[] = [];
for (let i = 0; i < N_USERS; i++) {
    const info = insertUser.run(`User ${i}`, `user${i}@test.com`, 'hash', 'employee');
    userIds.push(info.lastInsertRowid as number);
}

// Fast Implementation (RETURNING *)
function fastReturningInsert() {
    const missingUsers = userIds; // in real life, we would filter this list

    // Bulk insert missing drafts and return them
    const insertStmt = db.prepare(`
        INSERT INTO payrolls (user_id, start_date, end_date, base_salary, status)
        VALUES (?, ?, ?, 0, 'draft')
        RETURNING *
    `);

    let newPayrolls: any[] = [];
    const insertTx = db.transaction((users) => {
        for (const userId of users) {
            const payroll = insertStmt.get(userId, startDate, endDate);
            newPayrolls.push(payroll);
        }
    });
    insertTx(missingUsers);

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

const startFast = performance.now();
fastReturningInsert();
const endFast = performance.now();
const fastMs = endFast - startFast;

console.log(`Fast (RETURNING): ${fastMs.toFixed(2)} ms (${(fastMs / N_USERS).toFixed(3)} ms/row)`);
