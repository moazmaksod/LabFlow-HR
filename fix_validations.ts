import * as fs from 'fs';

const file = 'shared/validations.ts';
let content = fs.readFileSync(file, 'utf8');

// allow nulls on all fields
content = content.replace(
  /\.or\(z\.literal\(''\)\)/g,
  '.nullable().or(z.literal(""))'
);

content = content.replace(
  /export const EmployeeProfileSchema = z\.object\(\{/g,
  'export const EmployeeProfileSchema = z.object({'
);

fs.writeFileSync(file, content, 'utf8');
