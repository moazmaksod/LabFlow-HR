import * as fs from 'fs';

const file = 'shared/validations.ts';
let content = fs.readFileSync(file, 'utf8');

// For allow_overtime, we can use z.preprocess to convert any falsy/truthy value to boolean.
const oldSchema = `allow_overtime: z.boolean(),
  max_overtime_hours: z.coerce.number().min(1, 'Min 1 hour').max(168, 'Max 168 hours').optional().nullable().or(z.literal("").transform(() => 0)),`;

const newSchema = `allow_overtime: z.preprocess((val) => {
    if (val === 'false' || val === '0' || val === 0 || val === false || val === undefined || val === null) return false;
    return true;
  }, z.boolean()),
  max_overtime_hours: z.coerce.number().min(0, 'Min 0 hour').max(168, 'Max 168 hours').optional().nullable().or(z.literal("").transform(() => 0)),`;

content = content.replace(oldSchema, newSchema);

// Then we need to add a super refine to validate max_overtime_hours if allow_overtime is true
const oldSuper = `});`;
const newSuper = `}).refine(data => {
  if (data.allow_overtime) {
    return (data.max_overtime_hours || 0) >= 1;
  }
  return true;
}, {
  message: "Max OT Hours must be at least 1 when overtime is allowed",
  path: ["max_overtime_hours"]
});`;

content = content.replace(/suspension_reason: z\.string\(\)\.optional\(\)\.nullable\(\)\.or\(z\.literal\(""\)\)\n\}\);/g, `suspension_reason: z.string().optional().nullable().or(z.literal(""))\n${newSuper}`);

fs.writeFileSync(file, content, 'utf8');
