import { performance } from 'perf_hooks';
import db, { initDb } from '../db/index.js';

// Since calculateUserPayroll is not exported from payrollController.ts, we need to extract it to test it properly,
// or test the whole getAllPayroll endpoint. For the benchmark, we will simulate both approaches directly.
// Let's copy the logic temporarily to avoid exporting a private function if we don't need to.
const originalCalculateUserPayroll = (user: any, start_date: string, end_date: string) => {
    const hourlyRate = user.hourly_rate || 0;
    const schedule = user.weekly_schedule ? JSON.parse(user.weekly_schedule) : {};

    const logs = db.prepare(`
        SELECT * FROM attendance
        WHERE user_id = ? AND date BETWEEN ? AND ?
        ORDER BY date ASC
    `).all(user.id, start_date, end_date) as any[];

    let totalExpectedMinutes = 0;
    let totalActualWorkedMinutes = 0;
    let totalPaidPermissionMinutes = 0;
    let totalMissingMinutes = 0;
    let totalApprovedOvertimeMinutes = 0;

    const start = new Date(start_date as string);
    const end = new Date(end_date as string);
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    const logIds = logs.map(l => l.id);
    const breaksMap = new Map<number, any[]>();

    if (logIds.length > 0) {
        const placeholders = logIds.map(() => '?').join(',');
        const allBreaks = db.prepare(`
            SELECT attendance_id, start_time, end_time
            FROM shift_interruptions
            WHERE attendance_id IN (${placeholders})
        `).all(...logIds) as any[];

        allBreaks.forEach(b => {
            if (!breaksMap.has(b.attendance_id)) {
                breaksMap.set(b.attendance_id, []);
            }
            breaksMap.get(b.attendance_id)!.push(b);
        });
    }

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayName = days[d.getDay()];
        const dayShifts = schedule[dayName] || [];

        dayShifts.forEach((shift: any) => {
            const [startH, startM] = shift.start.split(':').map(Number);
            const [endH, endM] = shift.end.split(':').map(Number);
            totalExpectedMinutes += (endH * 60 + endM) - (startH * 60 + startM);
        });
    }

    logs.forEach(log => {
        const d = new Date(log.date);
        const dayName = days[d.getDay()];
        const dayShifts = schedule[dayName] || [];
        let expectedForDay = 0;
        dayShifts.forEach((shift: any) => {
            const [startH, startM] = shift.start.split(':').map(Number);
            const [endH, endM] = shift.end.split(':').map(Number);
            expectedForDay += (endH * 60 + endM) - (startH * 60 + startM);
        });

        let workedMinutes = 0;
        if (log.check_in && log.check_out) {
            const checkIn = new Date(log.check_in);
            const checkOut = new Date(log.check_out);
            workedMinutes = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60);

            const breaks = breaksMap.get(log.id) || [];
            breaks.forEach(b => {
                if (b.start_time && b.end_time) {
                    workedMinutes -= (new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / (1000 * 60);
                }
            });
        }

        workedMinutes = Math.max(0, workedMinutes);
        totalApprovedOvertimeMinutes += log.approved_overtime_minutes || 0;

        if (log.status === 'absent') {
            totalMissingMinutes += expectedForDay;
        } else {
            totalActualWorkedMinutes += workedMinutes;
            totalMissingMinutes += Math.max(0, expectedForDay - workedMinutes);
            totalPaidPermissionMinutes += log.paid_permission_minutes || 0;
        }
    });

    const logDates = new Set(logs.map(l => l.date));
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        if (!logDates.has(dateStr)) {
            const dayName = days[d.getDay()];
            const dayShifts = schedule[dayName] || [];
            dayShifts.forEach((shift: any) => {
                const [startH, startM] = shift.start.split(':').map(Number);
                const [endH, endM] = shift.end.split(':').map(Number);
                totalMissingMinutes += (endH * 60 + endM) - (startH * 60 + startM);
            });
        }
    }

    const unpaidMinutes = Math.max(0, totalMissingMinutes - totalPaidPermissionMinutes);
    const netWorkedMinutes = Math.max(0, totalActualWorkedMinutes - unpaidMinutes);
    const finalNetSalary = (netWorkedMinutes / 60) * hourlyRate;

    const grossBasePay = (totalActualWorkedMinutes / 60) * hourlyRate;
    const totalDeductions = (unpaidMinutes / 60) * hourlyRate;
    const overtimeBonus = (totalApprovedOvertimeMinutes / 60) * (hourlyRate * 1.5);
    const netSalaryWithOvertime = finalNetSalary + overtimeBonus;

    return {
        user: { id: user.id, name: user.name, job_title: user.job_title, hourly_rate: hourlyRate },
        time_metrics: {
            expected_hours: Number((totalExpectedMinutes / 60).toFixed(2)),
            actual_worked_hours: Number((totalActualWorkedMinutes / 60).toFixed(2)),
            paid_permission_hours: Number((totalPaidPermissionMinutes / 60).toFixed(2)),
            missing_unpaid_minutes: Math.round(unpaidMinutes),
            approved_overtime_minutes: totalApprovedOvertimeMinutes
        },
        financial_metrics: {
            gross_base_pay: Number(grossBasePay.toFixed(2)),
            total_deductions: Number(totalDeductions.toFixed(2)),
            overtime_bonus: Number(overtimeBonus.toFixed(2)),
            final_net_salary: Number(netSalaryWithOvertime.toFixed(2))
        }
    };
};

const optimizedCalculateUserPayroll = (user: any, start_date: string, end_date: string, prefetchedLogs?: any[], prefetchedBreaksMap?: Map<number, any[]>) => {
    const hourlyRate = user.hourly_rate || 0;
    const schedule = user.weekly_schedule ? JSON.parse(user.weekly_schedule) : {};

    const logs = prefetchedLogs || (db.prepare(`
        SELECT * FROM attendance
        WHERE user_id = ? AND date BETWEEN ? AND ?
        ORDER BY date ASC
    `).all(user.id, start_date, end_date) as any[]);

    let totalExpectedMinutes = 0;
    let totalActualWorkedMinutes = 0;
    let totalPaidPermissionMinutes = 0;
    let totalMissingMinutes = 0;
    let totalApprovedOvertimeMinutes = 0;

    const start = new Date(start_date as string);
    const end = new Date(end_date as string);
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

    const breaksMap = prefetchedBreaksMap || new Map<number, any[]>();

    if (!prefetchedBreaksMap) {
        const logIds = logs.map(l => l.id);
        if (logIds.length > 0) {
            const placeholders = logIds.map(() => '?').join(',');
            const allBreaks = db.prepare(`
                SELECT attendance_id, start_time, end_time
                FROM shift_interruptions
                WHERE attendance_id IN (${placeholders})
            `).all(...logIds) as any[];

            allBreaks.forEach(b => {
                if (!breaksMap.has(b.attendance_id)) {
                    breaksMap.set(b.attendance_id, []);
                }
                breaksMap.get(b.attendance_id)!.push(b);
            });
        }
    }

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayName = days[d.getDay()];
        const dayShifts = schedule[dayName] || [];

        dayShifts.forEach((shift: any) => {
            const [startH, startM] = shift.start.split(':').map(Number);
            const [endH, endM] = shift.end.split(':').map(Number);
            totalExpectedMinutes += (endH * 60 + endM) - (startH * 60 + startM);
        });
    }

    logs.forEach(log => {
        const d = new Date(log.date);
        const dayName = days[d.getDay()];
        const dayShifts = schedule[dayName] || [];
        let expectedForDay = 0;
        dayShifts.forEach((shift: any) => {
            const [startH, startM] = shift.start.split(':').map(Number);
            const [endH, endM] = shift.end.split(':').map(Number);
            expectedForDay += (endH * 60 + endM) - (startH * 60 + startM);
        });

        let workedMinutes = 0;
        if (log.check_in && log.check_out) {
            const checkIn = new Date(log.check_in);
            const checkOut = new Date(log.check_out);
            workedMinutes = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60);

            const breaks = breaksMap.get(log.id) || [];
            breaks.forEach(b => {
                if (b.start_time && b.end_time) {
                    workedMinutes -= (new Date(b.end_time).getTime() - new Date(b.start_time).getTime()) / (1000 * 60);
                }
            });
        }

        workedMinutes = Math.max(0, workedMinutes);
        totalApprovedOvertimeMinutes += log.approved_overtime_minutes || 0;

        if (log.status === 'absent') {
            totalMissingMinutes += expectedForDay;
        } else {
            totalActualWorkedMinutes += workedMinutes;
            totalMissingMinutes += Math.max(0, expectedForDay - workedMinutes);
            totalPaidPermissionMinutes += log.paid_permission_minutes || 0;
        }
    });

    const logDates = new Set(logs.map(l => l.date));
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        if (!logDates.has(dateStr)) {
            const dayName = days[d.getDay()];
            const dayShifts = schedule[dayName] || [];
            dayShifts.forEach((shift: any) => {
                const [startH, startM] = shift.start.split(':').map(Number);
                const [endH, endM] = shift.end.split(':').map(Number);
                totalMissingMinutes += (endH * 60 + endM) - (startH * 60 + startM);
            });
        }
    }

    const unpaidMinutes = Math.max(0, totalMissingMinutes - totalPaidPermissionMinutes);
    const netWorkedMinutes = Math.max(0, totalActualWorkedMinutes - unpaidMinutes);
    const finalNetSalary = (netWorkedMinutes / 60) * hourlyRate;

    const grossBasePay = (totalActualWorkedMinutes / 60) * hourlyRate;
    const totalDeductions = (unpaidMinutes / 60) * hourlyRate;
    const overtimeBonus = (totalApprovedOvertimeMinutes / 60) * (hourlyRate * 1.5);
    const netSalaryWithOvertime = finalNetSalary + overtimeBonus;

    return {
        user: { id: user.id, name: user.name, job_title: user.job_title, hourly_rate: hourlyRate },
        time_metrics: {
            expected_hours: Number((totalExpectedMinutes / 60).toFixed(2)),
            actual_worked_hours: Number((totalActualWorkedMinutes / 60).toFixed(2)),
            paid_permission_hours: Number((totalPaidPermissionMinutes / 60).toFixed(2)),
            missing_unpaid_minutes: Math.round(unpaidMinutes),
            approved_overtime_minutes: totalApprovedOvertimeMinutes
        },
        financial_metrics: {
            gross_base_pay: Number(grossBasePay.toFixed(2)),
            total_deductions: Number(totalDeductions.toFixed(2)),
            overtime_bonus: Number(overtimeBonus.toFixed(2)),
            final_net_salary: Number(netSalaryWithOvertime.toFixed(2))
        }
    };
};

const runBenchmark = async () => {
    console.log('Initializing DB for benchmark...');
    initDb();

    // 1. Setup Artificial Dataset
    const NUM_USERS = 500;
    console.log(`Setting up ${NUM_USERS} mock users...`);

    // Clean up first
    db.prepare("DELETE FROM shift_interruptions WHERE type = 'benchmark'").run();
    db.prepare("DELETE FROM attendance WHERE status = 'unscheduled'").run();
    db.prepare("DELETE FROM profiles WHERE hourly_rate = 123.45").run();
    db.prepare("DELETE FROM users WHERE email LIKE 'bench%@test.com'").run();

    const insertUser = db.prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, 'hash', 'employee')");
    const insertProfile = db.prepare("INSERT INTO profiles (user_id, hourly_rate, weekly_schedule) VALUES (?, ?, ?)");
    const insertAttendance = db.prepare("INSERT INTO attendance (user_id, date, check_in, check_out, status) VALUES (?, ?, ?, ?, 'unscheduled')");
    const insertBreak = db.prepare("INSERT INTO shift_interruptions (attendance_id, type, start_time, end_time) VALUES (?, 'benchmark', ?, ?)");

    const schedule = JSON.stringify({
        monday: [{ start: "09:00", end: "17:00" }],
        tuesday: [{ start: "09:00", end: "17:00" }],
        wednesday: [{ start: "09:00", end: "17:00" }],
        thursday: [{ start: "09:00", end: "17:00" }],
        friday: [{ start: "09:00", end: "17:00" }]
    });

    const userIds: number[] = [];
    const START_DATE = '2023-10-01';
    const END_DATE = '2023-10-31';

    db.transaction(() => {
        for (let i = 0; i < NUM_USERS; i++) {
            const res = insertUser.run(`Bench User ${i}`, `bench${i}@test.com`);
            const uid = res.lastInsertRowid as number;
            userIds.push(uid);
            insertProfile.run(uid, 123.45, schedule);

            // Create 20 attendance logs per user
            for (let d = 1; d <= 20; d++) {
                const dateStr = `2023-10-${d.toString().padStart(2, '0')}`;
                const checkIn = `${dateStr}T09:00:00Z`;
                const checkOut = `${dateStr}T17:00:00Z`;

                const attRes = insertAttendance.run(uid, dateStr, checkIn, checkOut);
                const attId = attRes.lastInsertRowid as number;

                // Add 1 break per attendance log
                insertBreak.run(attId, `${dateStr}T12:00:00Z`, `${dateStr}T13:00:00Z`);
            }
        }
    })();

    console.log('Setup complete.');

    // Fetch users like getAllPayroll does
    const users = db.prepare(`
        SELECT u.id, u.name, p.hourly_rate, p.weekly_schedule, p.max_overtime_hours, j.title as job_title
        FROM users u
        JOIN profiles p ON u.id = p.user_id
        LEFT JOIN jobs j ON p.job_id = j.id
        WHERE u.email LIKE 'bench%@test.com'
    `).all() as any[];

    console.log(`Running benchmark for ${users.length} users...`);

    // --- Optimized Bulk Implementation ---
    const t2 = performance.now();

    // 1. Bulk Fetch Logs
    const placeholders = users.map(() => '?').join(',');
    const allLogs = db.prepare(`
        SELECT * FROM attendance
        WHERE user_id IN (${placeholders}) AND date BETWEEN ? AND ?
        ORDER BY date ASC
    `).all(...users.map(u => u.id), START_DATE, END_DATE) as any[];

    const logsMap = new Map<number, any[]>();
    for (const log of allLogs) {
        if (!logsMap.has(log.user_id)) logsMap.set(log.user_id, []);
        logsMap.get(log.user_id)!.push(log);
    }

    // 2. Bulk Fetch Breaks
    const allBreaksMap = new Map<number, any[]>();
    const logIds = allLogs.map(l => l.id);

    if (logIds.length > 0) {
        const CHUNK_SIZE = 900;
        for (let i = 0; i < logIds.length; i += CHUNK_SIZE) {
            const chunk = logIds.slice(i, i + CHUNK_SIZE);
            const chunkPlaceholders = chunk.map(() => '?').join(',');
            const chunkBreaks = db.prepare(`
                SELECT attendance_id, start_time, end_time
                FROM shift_interruptions
                WHERE attendance_id IN (${chunkPlaceholders})
            `).all(...chunk) as any[];

            for (const b of chunkBreaks) {
                if (!allBreaksMap.has(b.attendance_id)) {
                    allBreaksMap.set(b.attendance_id, []);
                }
                allBreaksMap.get(b.attendance_id)!.push(b);
            }
        }
    }

    let newResults = [];
    for (const user of users) {
        const userLogs = logsMap.get(user.id) || [];
        newResults.push(optimizedCalculateUserPayroll(user, START_DATE, END_DATE, userLogs, allBreaksMap));
    }

    const t3 = performance.now();
    const newTime = t3 - t2;

    // --- Original N+1 Implementation ---
    const t0 = performance.now();
    let oldResults = [];
    for (const user of users) {
        oldResults.push(originalCalculateUserPayroll(user, START_DATE, END_DATE));
    }
    const t1 = performance.now();
    const oldTime = t1 - t0;
    console.log(`[Slow] N+1 calculateUserPayroll: ${oldTime.toFixed(2)} ms (${(oldTime / users.length).toFixed(2)} ms/user)`);

    console.log(`[Fast] Bulk calculateUserPayroll: ${newTime.toFixed(2)} ms (${(newTime / users.length).toFixed(2)} ms/user)`);

    const improvement = ((oldTime - newTime) / newTime) * 100;
    console.log(`Performance Improvement: ${improvement.toFixed(2)}%`);
    console.log(`Speedup factor: ${(oldTime / newTime).toFixed(2)}x`);

    // Correctness Check
    let isCorrect = true;
    for (let i = 0; i < users.length; i++) {
        const oldRes = JSON.stringify(oldResults[i]);
        const newRes = JSON.stringify(newResults[i]);
        if (oldRes !== newRes) {
            console.error(`Mismatch found for user ${users[i].id}:`);
            console.error('Old:', oldRes);
            console.error('New:', newRes);
            isCorrect = false;
            break;
        }
    }

    if (isCorrect) {
        console.log('✅ Correctness Verified: All outputs match perfectly.');
    } else {
        console.log('❌ Correctness Failed: Mismatch in outputs.');
    }

    // Cleanup
    db.prepare("DELETE FROM shift_interruptions WHERE type = 'benchmark'").run();
    db.prepare("DELETE FROM attendance WHERE status = 'unscheduled'").run();
    db.prepare("DELETE FROM profiles WHERE hourly_rate = 123.45").run();
    db.prepare("DELETE FROM users WHERE email LIKE 'bench%@test.com'").run();
    console.log('Cleanup complete.');
};

runBenchmark().catch(console.error);
