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

function optimizedSwitch() {
    let totalAdditions = 0;
    let totalDeductions = 0;
    for (const tx of testArray) {
        switch (tx.type) {
            case 'overtime':
            case 'bonus':
                totalAdditions += tx.amount;
                break;
            case 'late_deduction':
            case 'step_away_unpaid':
            case 'deduction':
            case 'disciplinary_penalty':
                totalDeductions += tx.amount;
                break;
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

measure('Baseline IF Chain', baseline);
measure('Optimized Switch', optimizedSwitch);