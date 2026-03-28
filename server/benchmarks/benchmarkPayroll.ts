import db, { initDb } from '../db/index.js';

initDb();

// Setup mock data for benchmark
function setupMockData() {
    // Clear existing data
    db.prepare('DELETE FROM users').run();
    db.prepare('DELETE FROM profiles').run();
    db.prepare('DELETE FROM attendance').run();
    db.prepare('DELETE FROM shift_interruptions').run();

    // Create user
    const insertUser = db.prepare(`
        INSERT INTO users (name, email, password_hash, role)
        VALUES ('Benchmark User', 'bench@example.com', 'hash', 'employee')
    `);
    const result = insertUser.run();
    const userId = result.lastInsertRowid;

    // Create profile
    const schedule = {
        monday: [{ start: "09:00", end: "17:00" }],
        tuesday: [{ start: "09:00", end: "17:00" }],
        wednesday: [{ start: "09:00", end: "17:00" }],
        thursday: [{ start: "09:00", end: "17:00" }],
        friday: [{ start: "09:00", end: "17:00" }]
    };

    db.prepare(`
        INSERT INTO profiles (user_id, hourly_rate, weekly_schedule)
        VALUES (?, ?, ?)
    `).run(userId, 20.0, JSON.stringify(schedule));

    // Create 365 days of logs (1 year)
    const startDate = new Date('2023-01-01');
    const insertAttendance = db.prepare(`
        INSERT INTO attendance (user_id, date, status, check_in, check_out)
        VALUES (?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < 365; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);
        const dateStr = currentDate.toISOString().split('T')[0];

        insertAttendance.run(
            userId,
            dateStr,
            'on_time',
            `${dateStr}T09:00:00.000Z`,
            `${dateStr}T17:00:00.000Z`
        );
    }

    return userId;
}

const userId = setupMockData();

const user = db.prepare(`
    SELECT u.id, u.name, p.hourly_rate, p.weekly_schedule, j.title as job_title
    FROM users u
    JOIN profiles p ON u.id = p.user_id
    LEFT JOIN jobs j ON p.job_id = j.id
    WHERE u.id = ?
`).get(userId);

const calculateUserPayrollSlow = (user: any, start_date: string, end_date: string) => {
    const hourlyRate = user.hourly_rate || 0;
    const schedule = user.weekly_schedule ? JSON.parse(user.weekly_schedule) : {};

    // Fetch Attendance Logs for the period
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

    // Calculate expected minutes for the whole period
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayName = days[d.getDay()];
        const dayShifts = schedule[dayName] || [];

        dayShifts.forEach((shift: any) => {
            const [startH, startM] = shift.start.split(':').map(Number);
            const [endH, endM] = shift.end.split(':').map(Number);
            totalExpectedMinutes += (endH * 60 + endM) - (startH * 60 + startM);
        });
    }

    const breakStmt = db.prepare('SELECT start_time, end_time FROM shift_interruptions WHERE attendance_id = ?');

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

            const breaks = breakStmt.all(log.id) as any[];
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

    // --- ISSUE ---
    // Add missing days that weren't in logs but had expected shifts
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split('T')[0];
        if (!logs.find(l => l.date === dateStr)) {
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

const calculateUserPayrollFast = (user: any, start_date: string, end_date: string) => {
    const hourlyRate = user.hourly_rate || 0;
    const schedule = user.weekly_schedule ? JSON.parse(user.weekly_schedule) : {};

    // Fetch Attendance Logs for the period
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

    // Calculate expected minutes for the whole period
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayName = days[d.getDay()];
        const dayShifts = schedule[dayName] || [];

        dayShifts.forEach((shift: any) => {
            const [startH, startM] = shift.start.split(':').map(Number);
            const [endH, endM] = shift.end.split(':').map(Number);
            totalExpectedMinutes += (endH * 60 + endM) - (startH * 60 + startM);
        });
    }

    const breakStmt = db.prepare('SELECT start_time, end_time FROM shift_interruptions WHERE attendance_id = ?');

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

            const breaks = breakStmt.all(log.id) as any[];
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

export function runBenchmark() {
    // Warm up
    for (let i = 0; i < 10; i++) {
        calculateUserPayrollFast(user, '2023-01-01', '2023-12-31');
        calculateUserPayrollSlow(user, '2023-01-01', '2023-12-31');
    }

    console.log("Starting slow benchmark...");
    const startSlow = performance.now();
    for (let i = 0; i < 1000; i++) {
        calculateUserPayrollSlow(user, '2023-01-01', '2023-12-31');
    }
    const endSlow = performance.now();
    console.log(`Slow execution time: ${(endSlow - startSlow).toFixed(2)} ms`);

    console.log("Starting fast benchmark...");
    const startFast = performance.now();
    for (let i = 0; i < 1000; i++) {
        calculateUserPayrollFast(user, '2023-01-01', '2023-12-31');
    }
    const endFast = performance.now();
    console.log(`Fast execution time: ${(endFast - startFast).toFixed(2)} ms`);

    console.log(`Improvement: ${((1 - (endFast - startFast)/(endSlow - startSlow)) * 100).toFixed(2)}% faster`);
}

runBenchmark();
