const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'mobile/src/screens/DashboardScreen.tsx');
let content = fs.readFileSync(file, 'utf8');

// Add import
content = content.replace(
    /import SmartAttendanceCard from '\.\.\/components\/SmartAttendanceCard';/,
    `import SmartAttendanceCard from '../components/SmartAttendanceCard';\nimport LiveServerClock from '../components/LiveServerClock';`
);

// Inject component
content = content.replace(
    /\{userProfile && \(\s*<SmartAttendanceCard/g,
    `<LiveServerClock />\n\n      {userProfile && (\n        <SmartAttendanceCard`
);

fs.writeFileSync(file, content);
