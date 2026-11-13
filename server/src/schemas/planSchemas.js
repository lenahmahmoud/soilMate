import { z } from 'zod';
import { PLAN_KEYS } from '../constants/soilmateEnums.js';
import { scoreBodySchema } from './rotationSchemas.js';

// labSequence follows the same rules as POST /rotation/score (3 items, one per slot, in order).
// A missing body is treated as {} so "POST /plans/compare" with no body also works.
export const compareBody = z.preprocess(
  (body) => body ?? {},
  z.strictObject({ labSequence: scoreBodySchema.shape.sequence.nullish() }),
);

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

export const chooseBody = z.strictObject({
  planSetId: z.string().regex(/^[0-9a-f]{24}$/i, 'Invalid plan set id'),
  planKey: z.enum(PLAN_KEYS),
  startDate: isoDate.optional(),
});