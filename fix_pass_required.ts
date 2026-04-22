import * as fs from 'fs';

const file = 'src/features/employees/EmployeeDetail.tsx';
let content = fs.readFileSync(file, 'utf8');

// We need to look up the active job and pass its required_hours_per_week
content = content.replace(
  "const watchedData = watch() as any;",
  "const watchedData = watch() as any;\n  const activeJob = jobs?.find((j: any) => j.id === watchedData.job_id);"
);

content = content.replace(
  /<WeeklyScheduleBuilder \n\s*schedule=\{watchedData\.weekly_schedule \|\| \{\}\}\n\s*onChange=\{\(newSchedule\) => reset\(\{ \.\.\.watchedData, weekly_schedule: newSchedule \}\)\}\n\s*onError=\{setHasScheduleError\}\n\s*\/>/,
  `<WeeklyScheduleBuilder
                  schedule={watchedData.weekly_schedule || {}}
                  onChange={(newSchedule) => reset({ ...watchedData, weekly_schedule: newSchedule })}
                  onError={setHasScheduleError}
                  requiredWeeklyHours={activeJob?.required_hours_per_week}
                />`
);

fs.writeFileSync(file, content, 'utf8');
