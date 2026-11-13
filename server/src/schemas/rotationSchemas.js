
import { z } from 'zod';
import { SLOTS } from '../constants/soilmateEnums.js';

const item = z.object({
  slot: z.enum(SLOTS),
  cropId: z.string().trim().min(1),
}).strict();

export const scoreBodySchema = z.object({
  sequence: z
    .array(item)
    .length(3)
    .refine(
      (seq) => seq.every((it, i) => it.slot === SLOTS[i]),
      {
        message: 'Slots must be fall_winter, spring, summer_fall, in this order',
      }
    ),
}).strict();
