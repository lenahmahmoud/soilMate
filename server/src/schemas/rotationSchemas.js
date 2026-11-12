import { z } from 'zod';
import { SLOTS } from '../constants/soilmateEnums.js';

const item = z.strictObject({
  slot: z.enum(SLOTS),
  cropId: z.string().trim().min(1).max(60),
});

// POST /rotation/score: exactly 3 items, one per slot, in order (guide 10.3 step 1).
export const scoreBody = z.strictObject({
  sequence: z
    .array(item)
    .length(3, 'Send exactly 3 items, one per season')
    .refine((seq) => seq.every((it, i) => it.slot === SLOTS[i]), {
      message: 'Slots must be fall_winter, spring, summer_fall, in this order',
    }),
});