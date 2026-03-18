const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'server/controllers/userController.ts');
let content = fs.readFileSync(file, 'utf8');

const regex = /const shiftDetails = getLogicalShiftDetails\(parsedSchedule, currentServerTime, timezone, 'check_in'\);\s*user\.current_shift = shiftDetails\.shift \? \{\s*start: shiftDetails\.shift\.start,\s*end: shiftDetails\.shift\.end,\s*date: shiftDetails\.logicalDate\s*\} : null;/g;

const replacement = `const shiftDetails = getLogicalShiftDetails(parsedSchedule, currentServerTime, timezone, 'check_in');

        let current_shift = null;
        if (shiftDetails.shift && shiftDetails.scheduledTime) {
            const shiftStartUtc = shiftDetails.scheduledTime.toISOString();

            // Calculate end time
            const [startH, startM] = shiftDetails.shift.start.split(':').map(Number);
            const [endH, endM] = shiftDetails.shift.end.split(':').map(Number);
            let durationMins = (endH * 60 + endM) - (startH * 60 + startM);
            if (durationMins < 0) durationMins += 24 * 60; // night shift

            const shiftEndUtc = new Date(shiftDetails.scheduledTime.getTime() + durationMins * 60 * 1000).toISOString();

            current_shift = {
                start: shiftDetails.shift.start,
                end: shiftDetails.shift.end,
                date: shiftDetails.logicalDate,
                start_utc: shiftStartUtc,
                end_utc: shiftEndUtc
            };
        }
        user.current_shift = current_shift;`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
