import * as fs from 'fs';

const file = 'src/features/employees/EmployeeDetail.tsx';
let content = fs.readFileSync(file, 'utf8');

// The user states "nothing happen when press".
// Check if the form validation fails silently.
content = content.replace(
  /console\.error\('Form validation failed:', errors\);/g,
  'console.error(\'Form validation failed:\', errors); alert(\'Validation Error: \' + Object.keys(errors).join(\', \'));'
);

fs.writeFileSync(file, content, 'utf8');
