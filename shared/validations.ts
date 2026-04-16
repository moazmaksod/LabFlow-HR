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
  .regex(/^[a-zA-Z\s]+$/, 'Name must not contain numbers or special characters');

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
  firstName: nameSchema,
  lastName: nameSchema,
  email: emailSchema,
  phone: phoneSchema.optional(),
  dateOfBirth: pastDateSchema.optional(),
  hireDate: pastDateSchema.optional(),
  nationalId: nationalIdSchema.optional(),
  bio: textSanitizedSchema.optional(),
});

// For admin settings
export const CompanySettingsSchema = z.object({
  companyName: z.string().min(1, 'Company name is required'),
  contactEmail: emailSchema,
  contactPhone: phoneSchema,
  establishedDate: pastDateSchema.optional(),
  description: textSanitizedSchema.optional(),
});
