const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'mobile/src/components/SmartAttendanceCard.tsx');
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
    /const \[y, m, d\] = todayShift\.date\.split\('-'\);/g,
    ''
);

content = content.replace(
    /const dayDiff = now.getDate\(\) !== shiftStartUtc.getDate\(\) \? 1 : 0; \/\/ Simplified for display logic\s*const shiftDate = shiftStartUtc;/g,
    `const dayDiff = now.getDate() !== shiftStartUtc.getDate() ? 1 : 0; // Simplified for display logic
  const shiftDate = shiftStartUtc;
  const startMins = 0; // Everything is relative to start now`
);

fs.writeFileSync(file, content);
