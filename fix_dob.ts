import * as fs from 'fs';

const file = 'src/features/employees/EmployeeDetail.tsx';
let content = fs.readFileSync(file, 'utf8');

// The date_of_birth might be a Date object or string from the backend like "1990-01-01T00:00:00.000Z"
content = content.replace(
  "{watchedData.date_of_birth || \"-\"}",
  "{watchedData.date_of_birth ? (watchedData.date_of_birth instanceof Date ? watchedData.date_of_birth.toISOString().split('T')[0] : String(watchedData.date_of_birth).split('T')[0]) : \"-\"}"
);

fs.writeFileSync(file, content, 'utf8');
