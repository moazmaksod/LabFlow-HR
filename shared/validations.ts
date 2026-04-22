import { z } from 'zod';

// Base Schemas

// numeric, custom length (e.g. 7 to 15 digits)
export const phoneSchema = z
  .string()
  .regex(/^\d+$/, 'Phone number must contain only digits')
  .min(7, 'Phone number must be at least 7 digits')
  .max(15, 'Phone number must not exceed 15 digits');

// standard email format
export const emailSchema = z
  .string()
  .email('Invalid email address');

// must be a valid date (string format or Date object)
export const dateSchema = z.preprocess((arg) => {
  if (typeof arg === 'string' || arg instanceof Date) {
    const d = new Date(arg);
    return isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}, z.date({ required_error: 'Valid date is required', invalid_type_error: 'Invalid date' }));

// valid date, max is today (for DOB, Hire Date). No 18-year age restriction.
export const pastDateSchema = dateSchema.refine((date) => {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return date <= today;
}, { message: 'Date must be in the past or today' });

// min 3 chars, no numbers/special symbols
export const nameSchema = z
  .string()
  .min(3, 'Name must be at least 3 characters')
  .regex(/^[\p{L}\s'-]+$/u, 'Name cannot contain numbers or special characters');

// alphanumeric, 8-20 chars
export const nationalIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9]+$/, 'National ID must be alphanumeric')
  .min(8, 'National ID must be at least 8 characters')
  .max(20, 'National ID must not exceed 20 characters');

// strips HTML tags <.*?>
export const textSanitizedSchema = z
  .string()
  .transform((val) => val.replace(/<.*?>/g, ''));

// Form Schemas

// For editing profile details
export const EmployeeProfileSchema = z.object({
  legal_name: nameSchema.optional().nullable().or(z.literal("")),
  personal_phone: phoneSchema.optional().nullable().or(z.literal("")),
  date_of_birth: pastDateSchema.optional().nullable().or(z.literal("")),
  national_id: nationalIdSchema.optional().nullable().or(z.literal("")),
  bio: textSanitizedSchema.optional().nullable().or(z.literal("")),
});

// For admin settings
export const CompanySettingsSchema = z.object({
  company_name: z.string().min(2, 'Company name is required'),
  company_wifi_ssid: z.string().optional().nullable().or(z.literal("")),
  geofence_radius: z.coerce.number().min(10, 'Must be at least 10'),
  late_grace_period: z.coerce.number().min(0, 'Cannot be negative'),
  office_lat: z.coerce.number().min(-90, 'Must be >= -90').max(90, 'Must be <= 90'),
  office_lng: z.coerce.number().min(-180, 'Must be >= -180').max(180, 'Must be <= 180'),
});

// Admin employee details
export const HrEmployeeDetailSchema = z.object({
  legal_name: nameSchema.optional().nullable().or(z.literal("")),
  personal_phone: phoneSchema.optional().nullable().or(z.literal("")),
  date_of_birth: pastDateSchema.optional().nullable().or(z.literal("")),
  national_id: nationalIdSchema.optional().nullable().or(z.literal("")),
  bio: textSanitizedSchema.optional().nullable().or(z.literal("")),
  job_id: z.coerce.number().optional().nullable().or(z.literal("")),
  status: z.enum(['active', 'inactive', 'suspended']),
  hourly_rate: z.coerce.number().min(0),
  weekly_schedule: z.any().optional(), // Can be an object or string depending on where it's parsed
  lunch_break_minutes: z.coerce.number().min(0),
  bank_name: z.string().min(2, 'Bank name must be at least 2 characters').optional().nullable().or(z.literal("")),
  bank_account_number: z.string().regex(/^[a-zA-Z0-9]+$/, 'Must be alphanumeric').optional().nullable().or(z.literal("")),
  bank_iban: z.string().regex(/^[a-zA-Z0-9]+$/, 'Must be alphanumeric').optional().nullable().or(z.literal("")),
  bank_account_iban: z.string().optional().nullable().or(z.literal("")), // Legacy fallback for EmployeeDetail
  emergency_contact_name: z.string().optional().nullable().or(z.literal("")),
  emergency_contact_phone: z.string().optional().nullable().or(z.literal("")),
  emergency_contact_relationship: z.string().optional().nullable().or(z.literal("")),
  annual_leave_balance: z.coerce.number().min(0).max(365, 'Max 365 days'),
  sick_leave_balance: z.coerce.number().min(0).max(365, 'Max 365 days'),
  allow_overtime: z.preprocess((val) => {
    if (val === 'false' || val === '0' || val === 0 || val === false || val === undefined || val === null) return false;
    return true;
  }, z.boolean()),
  max_overtime_hours: z.coerce.number().min(0, 'Min 0 hour').max(168, 'Max 168 hours').optional().nullable().or(z.literal("").transform(() => 0)),
  hire_date: z.any().optional().nullable(),
  suspension_reason: z.string().optional().nullable().or(z.literal(""))
}).refine(data => {
  if (data.allow_overtime) {
    return (data.max_overtime_hours || 0) >= 1;
  }
  return true;
}, {
  message: "Max OT Hours must be at least 1 when overtime is allowed",
  path: ["max_overtime_hours"]
});

// For employee registration
export const EmployeeRegistrationSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(6, 'Password must be at least 6 characters'),
  date_of_birth: pastDateSchema,
  gender: z.enum(['male', 'female', 'other'])
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"], // path of error
});
