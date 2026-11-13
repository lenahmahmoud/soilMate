import { z } from 'zod';
import { PLAN_TYPES } from '../constants/rotationLab.js';

function isRealDate(s) {
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

// Guide 12.3: reject dates more than 2 years away (past or future), compared in UTC.
function isWithinTwoYears(s) {
  const d = Date.parse(`${s}T00:00:00.000Z`);
  const now = new Date();
  const min = Date.UTC(now.getUTCFullYear() - 2, now.getUTCMonth(), now.getUTCDate());
  const max = Date.UTC(now.getUTCFullYear() + 2, now.getUTCMonth(), now.getUTCDate());
  return d >= min && d <= max;
}

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
  .refine(isRealDate, 'Not a real date')
  .refine(isWithinTwoYears, 'The date must be within 2 years of today');

// POST /plans/choose (C7): the client sends only the plan type (and an optional start date).
export const chooseBody = z.strictObject({
  planKey: z.enum(PLAN_TYPES),
  startDate: isoDate.optional(),
});