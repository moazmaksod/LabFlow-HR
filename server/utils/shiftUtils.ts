import { getDateStringInTimezone } from './dateUtils.js';

export const getLogicalShiftDetails = (
    schedule: any,
    timestamp: string,
    timezone: string,
    actionType: 'check_in' | 'check_out',
    referenceDate?: string
) => {
    const defaultDateStr = getDateStringInTimezone(timestamp, timezone);
    if (!schedule) {
        return { shift: null, scheduledTime: null, logicalDate: defaultDateStr };
    }

    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const punchTime = new Date(timestamp);

    // Formatter to convert Date to parts in the given timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: false
    });

    const getLocalTime = (date: Date) => {
        const parts = formatter.formatToParts(date);
        const getPart = (type: string) => parts.find(p => p.type === type)?.value || '00';
        return new Date(
            parseInt(getPart('year')),
            parseInt(getPart('month')) - 1,
            parseInt(getPart('day')),
            parseInt(getPart('hour')),
            parseInt(getPart('minute')),
            parseInt(getPart('second'))
        );
    };

    const localPunchTime = getLocalTime(punchTime);

    let allShifts: {
        dayName: string;
        shift: any;
        start: Date;
        end: Date;
        logicalDateStr: string;
    }[] = [];

    // Look at a 3-day window around the local punch time
    for (let offset = -1; offset <= 1; offset++) {
        const d = new Date(localPunchTime.getFullYear(), localPunchTime.getMonth(), localPunchTime.getDate() + offset);
        const dayName = days[d.getDay()];
        const logicalDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        const daySchedule = schedule[dayName];
        if (Array.isArray(daySchedule)) {
            daySchedule.forEach(shift => {
                const [startH, startM] = shift.start.split(':').map(Number);
                const [endH, endM] = shift.end.split(':').map(Number);

                const shiftStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), startH, startM, 0);
                const shiftEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), endH, endM, 0);

                // If end time is before start time, it crosses midnight into the next day
                if (endH < startH || (endH === startH && endM < startM)) {
                    shiftEnd.setDate(shiftEnd.getDate() + 1);
                }

                allShifts.push({
                    dayName,
                    shift,
                    start: shiftStart,
                    end: shiftEnd,
                    logicalDateStr
                });
            });
        }
    }

    // Sort shifts by start time
    allShifts.sort((a, b) => a.start.getTime() - b.start.getTime());

    // Gap-Based Identification
    let matchedShift = null;
    let scheduledTime: Date | null = null;
    let logicalDate = defaultDateStr;

    if (actionType === 'check_in') {
        for (let i = 0; i < allShifts.length; i++) {
            const currentShift = allShifts[i];
            const previousShift = i > 0 ? allShifts[i - 1] : null;

            // Is the user early for this shift? (After previous shift end, before this shift start)
            if (localPunchTime < currentShift.start) {
                if (!previousShift || localPunchTime > previousShift.end) {
                    matchedShift = currentShift.shift;
                    scheduledTime = currentShift.start;
                    logicalDate = currentShift.logicalDateStr;
                    break;
                }
            }

            // Is the user inside this shift?
            if (localPunchTime >= currentShift.start && localPunchTime <= currentShift.end) {
                matchedShift = currentShift.shift;
                scheduledTime = currentShift.start;
                logicalDate = currentShift.logicalDateStr;
                break;
            }
        }
    } else { // check_out
        if (referenceDate) {
            const refPunchTime = new Date(referenceDate);
            const refLocalTime = getLocalTime(refPunchTime);

            for (let i = 0; i < allShifts.length; i++) {
                const currentShift = allShifts[i];
                const previousShift = i > 0 ? allShifts[i - 1] : null;

                if (refLocalTime < currentShift.start) {
                    if (!previousShift || refLocalTime > previousShift.end) {
                        matchedShift = currentShift.shift;
                        scheduledTime = currentShift.end;
                        logicalDate = currentShift.logicalDateStr;
                        break;
                    }
                }

                if (refLocalTime >= currentShift.start && refLocalTime <= currentShift.end) {
                    matchedShift = currentShift.shift;
                    scheduledTime = currentShift.end;
                    logicalDate = currentShift.logicalDateStr;
                    break;
                }
            }
        }

        if (!matchedShift) {
            // Find the shift that is currently active or recently ended.
            for (let i = allShifts.length - 1; i >= 0; i--) {
                const currentShift = allShifts[i];
                if (localPunchTime >= currentShift.start && localPunchTime <= currentShift.end) {
                    matchedShift = currentShift.shift;
                    scheduledTime = currentShift.end;
                    logicalDate = currentShift.logicalDateStr;
                    break;
                }
                if (localPunchTime > currentShift.end) {
                    matchedShift = currentShift.shift;
                    scheduledTime = currentShift.end;
                    logicalDate = currentShift.logicalDateStr;
                    break;
                }
            }
        }
    }

    // Convert local scheduledTime back to UTC Date object precisely
    let scheduledTimeUTC: Date | null = null;
    if (scheduledTime) {
        // Create an initial guess in UTC
        const guessUTC = new Date(Date.UTC(
            scheduledTime.getFullYear(),
            scheduledTime.getMonth(),
            scheduledTime.getDate(),
            scheduledTime.getHours(),
            scheduledTime.getMinutes(),
            scheduledTime.getSeconds()
        ));

        // Iteratively adjust the guess until its local time matches the target scheduledTime
        for (let i = 0; i < 4; i++) {
            const gLocal = getLocalTime(guessUTC);
            const diff = scheduledTime.getTime() - gLocal.getTime();
            guessUTC.setTime(guessUTC.getTime() + diff);
        }
        scheduledTimeUTC = guessUTC;
    }

    return { shift: matchedShift, scheduledTime: scheduledTimeUTC, logicalDate };
};
