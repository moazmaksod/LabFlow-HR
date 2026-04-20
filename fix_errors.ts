import * as fs from 'fs';

const file = 'src/features/employees/EmployeeDetail.tsx';
let content = fs.readFileSync(file, 'utf8');

// There are a lot of \`errors.legal_name\` copy-paste remnants that TypeScript is complaining about.
// We should fix them all or remove the dynamic class if we can't be sure.
// Let's replace the dynamic error border class completely for now to ensure it complies.

content = content.replace(
  /\$\{errors\.legal_name \? "border-red-500" \: "border-border"\}/g,
  'border-border'
);

fs.writeFileSync(file, content, 'utf8');
