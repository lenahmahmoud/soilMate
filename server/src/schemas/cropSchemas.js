import { z } from 'zod';
import { SLOTS } from '../constants/soilmateEnums.js';

export const listCropsQuery = z.strictObject({
  use: z.enum(['current', 'rotation']).optional(),
  slot: z.enum(SLOTS).optional(),
});