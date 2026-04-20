import * as fs from 'fs';

const file = 'shared/validations.ts';
let content = fs.readFileSync(file, 'utf8');

const newSchema = `
// For employee registration
export const EmployeeRegistrationSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: z.string().min(6, 'Password must be at least 6 characters'),
  date_of_birth: pastDateSchema,
  gender: z.enum(['male', 'female', 'other'])
});
`;

content += newSchema;

fs.writeFileSync(file, content, 'utf8');
