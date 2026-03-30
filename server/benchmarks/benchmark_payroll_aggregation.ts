import { performance } from 'perf_hooks';

const types = ['overtime', 'bonus', 'late_deduction', 'step_away_unpaid', 'deduction', 'disciplinary_penalty', 'other'];
const N_PAYROLLS = 500;
const TX_PER_PAYROLL = 20;

const allTransactions = Array.from({ length: N_PAYROLLS * TX_PER_PAYROLL }, (_, i) => ({
    payroll_id: (i % N_PAYROLLS) + 1,
    type: types[Math.floor(Math.random() * types.length)],
    amount: Math.floor(Math.random() * 100),
    status: 'applied'
}));

const payrollIds = Array.from({ length: N_PAYROLLS }, (_, i) => i + 1);

function baseline() {
    // Current approach:
    // 1. Map all transactions to payroll ID
    const transactionMap = new Map<number, any[]>();
    for (const tx of allTransactions) {
        if (!transactionMap.has(tx.payroll_id)) transactionMap.set(tx.payroll_id, []);
        transactionMap.get(tx.payroll_id)!.push(tx);
    }

    // 2. Iterate through payrolls and their transactions
    let ops = 0;
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
            ops++;
        }
    }
}

// Simulating SQL aggregation (meaning we don't map individual rows, just use the grouped result)
// Since we can't easily mock DB here, let's just create what the DB would return.
const sqlAggregatedResult = payrollIds.map(id => {
    let additions = 0, deductions = 0;
    allTransactions.filter(tx => tx.payroll_id === id).forEach(tx => {
        if (tx.type === 'overtime' || tx.type === 'bonus') additions += tx.amount;
        else if (['late_deduction', 'step_away_unpaid', 'deduction', 'disciplinary_penalty'].includes(tx.type)) deductions += tx.amount;
    });
    return { payroll_id: id, total_additions: additions, total_deductions: deductions };
});

function optimizedSqlAgg() {
    // DB returns sqlAggregatedResult
    const transactionMap = new Map<number, { additions: number, deductions: number }>();
    for (const tx of sqlAggregatedResult) {
        transactionMap.set(tx.payroll_id, { additions: tx.total_additions, deductions: tx.total_deductions });
    }

    let ops = 0;
    for (const payrollId of payrollIds) {
        const agg = transactionMap.get(payrollId) || { additions: 0, deductions: 0 };
        const additions = agg.additions;
        const deductions = agg.deductions;
        ops++;
    }
}

function optimizedDict() {
    // Using a dictionary of types
    const transactionMap = new Map<number, any[]>();
    for (const tx of allTransactions) {
        if (!transactionMap.has(tx.payroll_id)) transactionMap.set(tx.payroll_id, []);
        transactionMap.get(tx.payroll_id)!.push(tx);
    }

    const isAddition: Record<string, boolean> = { overtime: true, bonus: true };
    const isDeduction: Record<string, boolean> = { late_deduction: true, step_away_unpaid: true, deduction: true, disciplinary_penalty: true };

    let ops = 0;
    for (const payrollId of payrollIds) {
        const transactions = transactionMap.get(payrollId) || [];
        let totalAdditions = 0;
        let totalDeductions = 0;

        for (const tx of transactions) {
            if (isAddition[tx.type]) {
                totalAdditions += tx.amount;
            } else if (isDeduction[tx.type]) {
                totalDeductions += tx.amount;
            }
            ops++;
        }
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

measure('Baseline', baseline);
measure('Optimized Dictionary Lookup', optimizedDict);
measure('Optimized SQL Aggregation', optimizedSqlAgg);
