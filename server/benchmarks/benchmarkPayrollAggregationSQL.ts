import db, { initDb } from '../db/index.js';
import { performance } from 'perf_hooks';

// Setup Mock DB Data
initDb();
db.exec(`
    CREATE TABLE IF NOT EXISTS payrolls_test (id INTEGER PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS payroll_transactions_test (
        payroll_id INTEGER,
        type TEXT,
        amount REAL,
        status TEXT
    );
`);
db.exec(`DELETE FROM payrolls_test; DELETE FROM payroll_transactions_test;`);

const insertPayroll = db.prepare(`INSERT INTO payrolls_test (id) VALUES (?)`);
const insertTx = db.prepare(`INSERT INTO payroll_transactions_test (payroll_id, type, amount, status) VALUES (?, ?, ?, ?)`);

const types = ['overtime', 'bonus', 'late_deduction', 'step_away_unpaid', 'deduction', 'disciplinary_penalty', 'other'];

db.transaction(() => {
    for (let i = 1; i <= 500; i++) {
        insertPayroll.run(i);
        for (let j = 0; j < 20; j++) {
            insertTx.run(
                i,
                types[Math.floor(Math.random() * types.length)],
                Math.floor(Math.random() * 100),
                'applied'
            );
        }
    }
})();

const allPayrollIds = Array.from({ length: 500 }, (_, i) => i + 1);
const payrollPlaceholders = allPayrollIds.map(() => '?').join(',');

function measure(name: string, fn: () => void) {
    const N = 100;
    const start = performance.now();
    for (let i = 0; i < N; i++) {
        fn();
    }
    const end = performance.now();
    console.log(`${name}: ${((end - start) / N).toFixed(4)} ms per run`);
}

measure('Baseline JS Aggregation', () => {
    const allTransactions = db.prepare(`
        SELECT payroll_id, type, amount, status
        FROM payroll_transactions_test
        WHERE payroll_id IN (${payrollPlaceholders}) AND status = 'applied'
    `).all(...allPayrollIds) as any[];

    const transactionMap = new Map<number, any[]>();
    for (const tx of allTransactions) {
        if (!transactionMap.has(tx.payroll_id)) transactionMap.set(tx.payroll_id, []);
        transactionMap.get(tx.payroll_id)!.push(tx);
    }

    for (const payrollId of allPayrollIds) {
        const transactions = transactionMap.get(payrollId) || [];
        let totalAdditions = 0;
        let totalDeductions = 0;

        for (const tx of transactions) {
            if (tx.type === 'overtime' || tx.type === 'bonus') {
                totalAdditions += tx.amount;
            } else if (tx.type === 'late_deduction' || tx.type === 'step_away_unpaid' || tx.type === 'deduction' || tx.type === 'disciplinary_penalty') {
                totalDeductions += tx.amount;
            }
        }
    }
});

measure('Optimized Pre-Agg Map (Loop over DB result once)', () => {
    const allTransactions = db.prepare(`
        SELECT payroll_id, type, amount, status
        FROM payroll_transactions_test
        WHERE payroll_id IN (${payrollPlaceholders}) AND status = 'applied'
    `).all(...allPayrollIds) as any[];

    // This dictionary approach prevents mapping individual arrays
    const transactionMap = new Map<number, { additions: number; deductions: number }>();

    // Hardcoded flags instead of object lookup
    const txIsAddition: Record<string, boolean> = { overtime: true, bonus: true };
    const txIsDeduction: Record<string, boolean> = { late_deduction: true, step_away_unpaid: true, deduction: true, disciplinary_penalty: true };

    for (const tx of allTransactions) {
        let agg = transactionMap.get(tx.payroll_id);
        if (!agg) {
            agg = { additions: 0, deductions: 0 };
            transactionMap.set(tx.payroll_id, agg);
        }

        if (txIsAddition[tx.type]) {
            agg.additions += tx.amount;
        } else if (txIsDeduction[tx.type]) {
            agg.deductions += tx.amount;
        }
    }

    for (const payrollId of allPayrollIds) {
        const agg = transactionMap.get(payrollId) || { additions: 0, deductions: 0 };
        const totalAdditions = agg.additions;
        const totalDeductions = agg.deductions;
    }
});
