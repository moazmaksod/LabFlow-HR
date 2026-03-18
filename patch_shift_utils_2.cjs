const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'server/utils/shiftUtils.ts');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/getLocalTimeUTCUTC/g, 'getLocalTimeUTC');

content = content.replace(
    /let scheduledTimeUTC: Date \| null = null;[\s\S]*?return { shift: matchedShift, scheduledTime: scheduledTimeUTC, logicalDate };/,
    `let scheduledTimeUTC: Date | null = null;
    if (scheduledTime) {
        // Create an initial guess in UTC
        const guessUTC = new Date(Date.UTC(
            scheduledTime.getUTCFullYear(),
            scheduledTime.getUTCMonth(),
            scheduledTime.getUTCDate(),
            scheduledTime.getUTCHours(),
            scheduledTime.getUTCMinutes(),
            scheduledTime.getUTCSeconds()
        ));

        // Iteratively adjust the guess until its local time matches the target scheduledTime
        for (let i = 0; i < 4; i++) {
            const gLocal = getLocalTimeUTC(guessUTC);
            const diff = scheduledTime.getTime() - gLocal.getTime();
            guessUTC.setTime(guessUTC.getTime() + diff);
        }
        scheduledTimeUTC = guessUTC;
    }

    return { shift: matchedShift, scheduledTime: scheduledTimeUTC, logicalDate };`
);

fs.writeFileSync(file, content);
