import { performance } from 'perf_hooks';

const types = ['overtime', 'bonus', 'late_deduction', 'step_away_unpaid', 'deduction', 'disciplinary_penalty', 'other'];

const N = 10000;
const testArray = Array.from({ length: N }, () => ({
    type: types[Math.floor(Math.random() * types.length)],
    amount: 10
}));

function baseline() {
    let totalAdditions = 0;
    let totalDeductions = 0;
    for (const tx of testArray) {
        if (tx.type === 'overtime' || tx.type === 'bonus') {
            totalAdditions += tx.amount;
        } else if (tx.type === 'late_deduction' || tx.type === 'step_away_unpaid' || tx.type === 'deduction' || tx.type === 'disciplinary_penalty') {
            totalDeductions += tx.amount;
        }
    }
}

const isAdditionObj: Record<string, boolean> = { overtime: true, bonus: true };
const isDeductionObj: Record<string, boolean> = { late_deduction: true, step_away_unpaid: true, deduction: true, disciplinary_penalty: true };

function optimizedObjectDict() {
    let totalAdditions = 0;
    let totalDeductions = 0;
    for (const tx of testArray) {
        if (isAdditionObj[tx.type]) {
            totalAdditions += tx.amount;
        } else if (isDeductionObj[tx.type]) {
            totalDeductions += tx.amount;
        }
    }
}

const additionSet = new Set(['overtime', 'bonus']);
const deductionSet = new Set(['late_deduction', 'step_away_unpaid', 'deduction', 'disciplinary_penalty']);

function optimizedSetLookup() {
    let totalAdditions = 0;
    let totalDeductions = 0;
    for (const tx of testArray) {
        if (additionSet.has(tx.type)) {
            totalAdditions += tx.amount;
        } else if (deductionSet.has(tx.type)) {
            totalDeductions += tx.amount;
        }
    }
}

function measure(name: string, fn: () => void) {
    const iters = 10000;
    const start = performance.now();
    for (let i = 0; i < iters; i++) {
        fn();
    }
    const end = performance.now();
    console.log(`${name}: ${((end - start) / iters).toFixed(5)} ms per run`);
}

measure('Baseline', baseline);
measure('Optimized Object Dict', optimizedObjectDict);
measure('Optimized Set Lookup', optimizedSetLookup);
