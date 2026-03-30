import { performance } from 'perf_hooks';

const types = ['overtime', 'bonus', 'late_deduction', 'step_away_unpaid', 'deduction', 'disciplinary_penalty', 'other'];
const N_USERS = 500;
const TX_PER_USER = 20;

const allTransactions = Array.from({ length: N_USERS * TX_PER_USER }, (_, i) => ({
    payroll_id: (i % N_USERS) + 1,
    type: types[Math.floor(Math.random() * types.length)],
    amount: Math.floor(Math.random() * 100)
}));

const payrollIds = Array.from({ length: N_USERS }, (_, i) => i + 1);

function baselineArrayMap() {
    const transactionMap = new Map<number, any[]>();
    for (const tx of allTransactions) {
        if (!transactionMap.has(tx.payroll_id)) transactionMap.set(tx.payroll_id, []);
        transactionMap.get(tx.payroll_id)!.push(tx);
    }

    let dummyOps = 0;
    for (const payrollId of payrollIds) {
        const transactions = transactionMap.get(payrollId) || [];
        let totalAdditions = 0;
        let totalDeductions = 0;

        for (const tx of transactions) {
            if (tx.type === 'overtime' || tx.type === 'bonus') {
                totalAdditions += tx.amount;
            } else if (tx.type === 'late_deduction' || tx.type === 'step_away_unpaid' || tx.type === 'deduction' || tx.type === 'disciplinary_penalty') {
                totalDeductions += tx.amount;
            }
            dummyOps++;
        }
    }
}

function singlePassObjectMap() {
    // We pre-aggregate directly inside the first loop instead of building arrays
    // For fast retrieval, we use a fixed array map since payroll_id are mostly dense and numeric
    // or we can use a standard Map object, let's use Map.
    const aggMap = new Map<number, { additions: number; deductions: number }>();

    // We must initialize since some users might have NO transactions
    // but the original code handles this via a default empty array.
    for (const id of payrollIds) {
        aggMap.set(id, { additions: 0, deductions: 0 });
    }

    for (const tx of allTransactions) {
        const agg = aggMap.get(tx.payroll_id)!;
        if (tx.type === 'overtime' || tx.type === 'bonus') {
            agg.additions += tx.amount;
        } else if (tx.type === 'late_deduction' || tx.type === 'step_away_unpaid' || tx.type === 'deduction' || tx.type === 'disciplinary_penalty') {
            agg.deductions += tx.amount;
        }
    }

    let dummyOps = 0;
    for (const payrollId of payrollIds) {
        const agg = aggMap.get(payrollId)!;
        const totalAdditions = agg.additions;
        const totalDeductions = agg.deductions;
        dummyOps++;
    }
}

function measure(name: string, fn: () => void) {
    const N = 1000;
    const start = performance.now();
    for (let i = 0; i < N; i++) {
        fn();
    }
    const end = performance.now();
    console.log(`${name}: ${((end - start) / N).toFixed(4)} ms per run`);
}

measure('Baseline Array Map', baselineArrayMap);
measure('Single-Pass Pre-Agg Map', singlePassObjectMap);
