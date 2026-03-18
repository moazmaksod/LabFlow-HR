const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'server/utils/shiftUtils.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    /const getLocalTime = \(date: Date\) => {[\s\S]*?const localPunchTime = getLocalTime\(punchTime\);[\s\S]*?allShifts\.push\(\{[\s\S]*?\}\);[\s\S]*?\}\);[\s\S]*?\}[\s\S]*?\}/g,
    `const getLocalTimeUTC = (date: Date) => {
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

    const localPunchTime = getLocalTimeUTC(punchTime);

    let allShifts: {
        dayName: string;
        shift: any;
        start: Date;
        end: Date;
        logicalDateStr: string;
    }[] = [];

    // Look at a 7-day window around the local punch time to find the nearest upcoming shift
    for (let offset = -1; offset <= 7; offset++) {
        const d = new Date(Date.UTC(localPunchTime.getUTCFullYear(), localPunchTime.getUTCMonth(), localPunchTime.getUTCDate() + offset));
        const dayName = days[d.getUTCDay()];
        const logicalDateStr = \`\${d.getUTCFullYear()}-\${String(d.getUTCMonth() + 1).padStart(2, '0')}-\${String(d.getUTCDate()).padStart(2, '0')}\`;

        const daySchedule = schedule[dayName];
        if (Array.isArray(daySchedule)) {
            daySchedule.forEach(shift => {
                const [startH, startM] = shift.start.split(':').map(Number);
                const [endH, endM] = shift.end.split(':').map(Number);

                const shiftStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), startH, startM, 0));
                const shiftEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), endH, endM, 0));

                // If end time is before start time, it crosses midnight into the next day
                if (endH < startH || (endH === startH && endM < startM)) {
                    shiftEnd.setUTCDate(shiftEnd.getUTCDate() + 1);
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
    }`
);

content = content.replace(/getLocalTime/g, 'getLocalTimeUTC');

fs.writeFileSync(file, content);
