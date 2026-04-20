import * as fs from 'fs';

const file = 'src/features/employees/EmployeeDetail.tsx';
let content = fs.readFileSync(file, 'utf8');

// We need to change button type to button so it does not submit a parent form accidentally,
// though there is no form element.
content = content.replace(
  /<button\s+onClick=\{handleSave\}/g,
  '<button type="button" onClick={handleSave}'
);

fs.writeFileSync(file, content, 'utf8');
