import { z } from 'zod';

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

// Strips spaces, dashes and brackets. An empty value clears the phone.
const phone = z.union([
  z.null(),
  z
    .string()
    .transform((s) => {
      const cleaned = s.trim().replace(/[\s\-()]/g, '');
      return cleaned === '' ? null : cleaned;
    })
    .refine((v) => v === null || /^\+?\d{7,15}$/.test(v), {
      message: 'Enter a valid phone number (7 to 15 digits, optional leading +)',
    }),
]);

// Email is read-only: strictObject rejects it (and any other unknown key).
export const updateMeSchema = z
  .strictObject({
    fullName: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(80, 'Name must be at most 80 characters')
      .optional(),
    phone: phone.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Provide at least one field to update',
  });

export const changePasswordSchema = z
  .strictObject({
    currentPassword: z.string().min(1, 'Current password is required').max(72),
    newPassword: password,
    confirmNewPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmNewPassword, {
    path: ['confirmNewPassword'],
    message: 'Passwords do not match',
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'New password must be different from the current one',
  });

export const deleteMeSchema = z.strictObject({
  confirmEmail: z.string().trim().toLowerCase().min(1, 'Type your email to confirm'),
});