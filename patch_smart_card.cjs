const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'mobile/src/components/SmartAttendanceCard.tsx');
let content = fs.readFileSync(file, 'utf8');

// Replace todayDate, shiftDate, currentNowMins etc
content = content.replace(
    /const shiftDate = new Date\(parseInt\(y\), parseInt\(m\) - 1, parseInt\(d\)\);\s*const todayDate = new Date\(now\.getFullYear\(\), now\.getMonth\(\), now\.getDate\(\)\);\s*const dayDiff = Math\.round\(\(todayDate\.getTime\(\) - shiftDate\.getTime\(\)\) \/ \(1000 \* 60 \* 60 \* 24\)\);\s*const nowMins = now\.getHours\(\) \* 60 \+ now\.getMinutes\(\);\s*let currentNowMins = nowMins \+ \(dayDiff \* 24 \* 60\);/g,
    `const shiftStartUtc = new Date(todayShift.start_utc);
  const shiftEndUtc = new Date(todayShift.end_utc);
  const totalMins = (shiftEndUtc.getTime() - shiftStartUtc.getTime()) / (1000 * 60);
  const currentNowMins = (now.getTime() - shiftStartUtc.getTime()) / (1000 * 60);

  const dayDiff = now.getDate() !== shiftStartUtc.getDate() ? 1 : 0; // Simplified for display logic
  const shiftDate = shiftStartUtc;`
);

// Remove the old totalMins logic
content = content.replace(
    /const startMins = timeToMinutes\(todayShift\.start\);\s*let endMins = timeToMinutes\(todayShift\.end\);\s*if \(endMins < startMins\) \{\s*endMins \+= 24 \* 60; \/\/ Handle night shifts crossing midnight\s*\}\s*const totalMins = endMins - startMins;/g,
    ''
);

// Replace checkIn calculations inside isClockedIn
content = content.replace(
    /const checkInDate = new Date\(activeSession\.check_in\);\s*const totalElapsed = \(now\.getTime\(\) - checkInDate\.getTime\(\)\) \/ \(1000 \* 60\);\s*workedMins = Math\.max\(0, totalElapsed - breakMins\);\s*const shiftStartAbsolute = new Date\(shiftDate\);\s*const \[startH, startM\] = todayShift\.start\.split\(':'\)\.map\(Number\);\s*shiftStartAbsolute\.setHours\(startH, startM, 0, 0\);\s*const shiftEndAbsolute = new Date\(shiftStartAbsolute\);\s*shiftEndAbsolute\.setMinutes\(shiftEndAbsolute\.getMinutes\(\) \+ totalMins\);\s*remainingMins = Math\.max\(0, \(shiftEndAbsolute\.getTime\(\) - now\.getTime\(\)\) \/ \(1000 \* 60\)\);\s*const getMinsFromShiftStart = \(dateStr: string \| Date\) => \{\s*const d = typeof dateStr === 'string' \? new Date\(dateStr\) : dateStr;\s*return \(d\.getTime\(\) - shiftStartAbsolute\.getTime\(\)\) \/ \(1000 \* 60\);\s*\};/g,
    `const checkInDate = new Date(activeSession.check_in);
    const totalElapsed = (now.getTime() - checkInDate.getTime()) / (1000 * 60);
    workedMins = Math.max(0, totalElapsed - breakMins);

    remainingMins = Math.max(0, (shiftEndUtc.getTime() - now.getTime()) / (1000 * 60));

    const getMinsFromShiftStart = (dateStr: string | Date) => {
      const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
      return (d.getTime() - shiftStartUtc.getTime()) / (1000 * 60);
    };`
);

// Fix the progress bar indicator calculation
content = content.replace(
    /let nowPct = \(\(currentNowMins - startMins\) \/ totalMins\) \* 100;/g,
    `let nowPct = (currentNowMins / totalMins) * 100;`
);

fs.writeFileSync(file, content);
