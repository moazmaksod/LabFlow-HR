import * as fs from 'fs';

const file = 'src/components/WeeklyScheduleBuilder.tsx';
let content = fs.readFileSync(file, 'utf8');

// Update Props interface
content = content.replace(
  "onError?: (hasError: boolean) => void;",
  "onError?: (hasError: boolean) => void;\n  requiredWeeklyHours?: number;"
);

// Update component signature
content = content.replace(
  "export const WeeklyScheduleBuilder: React.FC<WeeklyScheduleBuilderProps> = ({ schedule, onChange, onError }) => {",
  "export const WeeklyScheduleBuilder: React.FC<WeeklyScheduleBuilderProps> = ({ schedule, onChange, onError, requiredWeeklyHours }) => {"
);

// Update UI
const oldHeader = `<div className="flex justify-between items-center bg-primary/10 border border-primary/20 px-4 py-3 rounded-xl mb-2">
          <span className="text-xs font-black uppercase tracking-widest text-primary">Total Weekly Working Hours</span>
          <span className="text-sm font-black text-primary">{formatDuration(totalWeeklyMinutes)}</span>
        </div>`;
const newHeader = `<div className="flex justify-between items-center bg-primary/10 border border-primary/20 px-4 py-3 rounded-xl mb-2">
          <span className="text-xs font-black uppercase tracking-widest text-primary">Total Weekly Working Hours</span>
          <span className="text-sm font-black text-primary">
            {formatDuration(totalWeeklyMinutes)}
            {requiredWeeklyHours ? \` / \${requiredWeeklyHours.toString().padStart(2, '0')}:00\` : ''}
          </span>
        </div>`;

content = content.replace(oldHeader, newHeader);

fs.writeFileSync(file, content, 'utf8');
