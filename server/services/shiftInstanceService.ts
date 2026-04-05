import db from '../db/index.js';

export function generateShiftInstances(userId: number, weeklyScheduleRaw: string | null, timezone: string): void {
    if (!weeklyScheduleRaw) {
        return;
    }

    let schedule: Record<string, { start: string; end: string }[]> | null = null;
    try {
        schedule = JSON.parse(weeklyScheduleRaw);
    } catch (e) {
        console.error(`Error parsing weekly schedule for user ${userId}:`, e);
        return;
    }

    if (!schedule) {
        return;
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });

    const getLocalTimeUTC = (date: Date) => {
        const parts = formatter.formatToParts(date);
        const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
        return new Date(Date.UTC(
            parseInt(getPart('year')),
            parseInt(getPart('month')) - 1,
            parseInt(getPart('day')),
            parseInt(getPart('hour')),
            parseInt(getPart('minute')),
            parseInt(getPart('second'))
        ));
    };

    const fromLocalToUTC = (localDate: Date) => {
        // We have a Date object that represents the local time as if it were UTC.
        // E.g., if local time is 10:00, localDate.getUTCHours() === 10.
        // We want to find the true UTC Date such that when formatted in 'timezone', it gives this local time.

        let guessUTC = new Date(Date.UTC(
            localDate.getUTCFullYear(),
            localDate.getUTCMonth(),
            localDate.getUTCDate(),
            localDate.getUTCHours(),
            localDate.getUTCMinutes(),
            localDate.getUTCSeconds()
        ));

        for (let i = 0; i < 4; i++) {
            const gLocal = getLocalTimeUTC(guessUTC);
            const diff = localDate.getTime() - gLocal.getTime();
            guessUTC.setTime(guessUTC.getTime() + diff);
        }
        return guessUTC;
    };

    const now = new Date();
    const localNow = getLocalTimeUTC(now);

    const generateTransaction = db.transaction(() => {
        // 1. Delete future 'Scheduled' records
        db.prepare(`
            DELETE FROM shift_instances
            WHERE user_id = ? AND status = 'Scheduled' AND start_time > ?
        `).run(userId, now.toISOString());

        // 2. Generate future shifts for 30 days
        const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

        const insertStmt = db.prepare(`
            INSERT INTO shift_instances (user_id, start_time, end_time, logical_date, status)
            VALUES (?, ?, ?, ?, 'Scheduled')
        `);

        // Generate shifts from today until 30 days into the future
        for (let offset = 0; offset <= 30; offset++) {
            const d = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() + offset));
            const dayName = daysOfWeek[d.getUTCDay()];
            const logicalDateStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

            const daySchedule = schedule![dayName];
            if (Array.isArray(daySchedule)) {
                daySchedule.forEach(shift => {
                    const [startH, startM] = shift.start.split(':').map(Number);
                    const [endH, endM] = shift.end.split(':').map(Number);

                    const shiftStartLocal = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), startH, startM, 0));
                    const shiftEndLocal = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), endH, endM, 0));

                    // Midnight handling: If end time is before start time, it crosses midnight
                    if (endH < startH || (endH === startH && endM < startM)) {
                        shiftEndLocal.setUTCDate(shiftEndLocal.getUTCDate() + 1);
                    }

                    const shiftStartUTC = fromLocalToUTC(shiftStartLocal);
                    const shiftEndUTC = fromLocalToUTC(shiftEndLocal);

                    // Only insert if it's in the future relative to the deletion point
                    if (shiftStartUTC > now) {
                        insertStmt.run(userId, shiftStartUTC.toISOString(), shiftEndUTC.toISOString(), logicalDateStr);
                    }
                });
            }
        }
    });

    generateTransaction();
}
