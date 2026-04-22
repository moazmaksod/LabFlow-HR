import * as fs from 'fs';

const file = 'src/components/WeeklyScheduleBuilder.tsx';
let content = fs.readFileSync(file, 'utf8');

const newFormat = `const formatDuration = (totalMins: number) => {
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return \`\${hours.toString().padStart(2, '0')}:\${mins.toString().padStart(2, '0')}\`;
};`;

content = content.replace(/const formatDuration = \([\s\S]*?;\n\};/m, newFormat);

fs.writeFileSync(file, content, 'utf8');
