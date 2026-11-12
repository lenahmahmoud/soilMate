import { z } from 'zod';
import { METRIC_IDS } from '../../constants/metrics.js';
import { LEVELS } from '../../constants/levels.js';
import { SLOTS } from '../../constants/soilmateEnums.js';

const score = z.number().int().min(0).max(100);
const label = z.string().min(1);

const metric = z.object({
  value: score,
  level: z.enum(LEVELS).optional(), // if present it must be high | moderate | low (guide 10.5)
  text: label,
  basis: label,
  reasons: z.array(z.string()).default([]),
});

const meter = z.object({ value: score, label, note: z.string() });

// Shape of POST /v1/score (contract section 11). Unknown keys are stripped.
export const scoreResultSchema = z.object({
  status: z.enum(['placeholder', 'final']),
  modelVersion: label,
  metrics: z.object(Object.fromEntries(METRIC_IDS.map((id) => [id, metric]))),
  seasonDetails: z
    .array(
      z.object({
        slot: z.enum(SLOTS),
        cropId: label,
        groundCover: meter,
        waterDemand: meter,
      }),
    )
    .length(3),
   dataConfidence: z.object({
    level: z.enum(['high', 'medium', 'low']),
    note: z.string(),
  }),
  gaps: z.array(z.string()),
  notices: z.array(z.string()),
});