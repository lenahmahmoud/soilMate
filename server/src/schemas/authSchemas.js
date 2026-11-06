import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'));

const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters')
  .regex(/[A-Za-z]/, 'Password must contain at least one letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const signupSchema = z
  .strictObject({
    fullName: z
      .string()
      .trim()
      .min(2, 'Name must be at least 2 characters')
      .max(80, 'Name must be at most 80 characters'),
    email,
    password,
    confirmPassword: z.string(),
    acceptedTerms: z.literal(true, { error: 'You must accept the terms' }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export const loginSchema = z.strictObject({
  email,
  password: z.string().min(1, 'Password is required').max(72),
  rememberMe: z.boolean().optional().default(false),
});

export const forgotPasswordSchema = z.strictObject({ email });