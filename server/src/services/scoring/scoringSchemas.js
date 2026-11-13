import { z } from 'zod';
import { METRIC_IDS } from '../../constants/metrics.js';
import { LEVELS } from '../../constants/levels.js';
import { SLOTS, AREA_PLAN_KEYS } from '../../constants/soilmateEnums.js';

const score = z.number().int().min(0).max(100);
const label = z.string().min(1);

const meter = z.object({ value: score, label, note: z.string() });

const dataConfidence = z.object({
  level: z.enum(['high', 'medium', 'low']),
  note: z.string(),
});

const seasonDetails = z
  .array(
    z.object({
      slot: z.enum(SLOTS),
      cropId: label,
      groundCover: meter,
      waterDemand: meter,
    }),
  )
  .length(3);

// ---------- POST /v1/score. Unknown keys are stripped. ----------
const metric = z.object({
  value: score,
  level: z.enum(LEVELS).optional(), // if present it must be high | moderate | low (guide 10.5)
  text: label,
  basis: label,
  reasons: z.array(z.string()).default([]),
});

// The plan block that goes with a scored rotation (the farmer's own plan on the compare page).
const planBlock = z.object({
  mainBenefit: label,
  watchOut: label,
  evidence: z.array(z.string()),
  infoGaps: z.array(z.string()),
  risksToReview: z.array(z.string()),
});

export const scoreResultSchema = z.object({
  status: z.enum(['placeholder', 'final']),
  modelVersion: label,
  metrics: z.object(Object.fromEntries(METRIC_IDS.map((id) => [id, metric]))),
  plan: planBlock, // required by the compare page, which checks it
  seasonDetails,
  dataConfidence,
  gaps: z.array(z.string()),
  notices: z.array(z.string()),
});

// ---------- POST /v1/plans: the 2 FIXED plans of the area. Python does NOT rank; Node does. ----------
const planMetric = z.object({
  value: score,
  level: z.enum(LEVELS).optional(),
  note: label,
});

const planItem = z.object({
  slot: z.enum(SLOTS),
  cropId: label,
  roleTag: z.string().nullable().optional(), // Node can fill it from the catalog
});

const plan = z.object({
  planKey: z.enum(AREA_PLAN_KEYS),
  badge: z.object({ label, tone: z.enum(['neutral', 'positive']) }),
  title: label,
  mainBenefit: label,
  watchOut: label,
  sequence: z
    .array(planItem)
    .length(3)
    .refine((seq) => seq.every((it, i) => it.slot === SLOTS[i]), {
      message: 'Plan slots must be fall_winter, spring, summer_fall, in this order',
    }),
  metrics: z.object(Object.fromEntries(METRIC_IDS.map((id) => [id, planMetric]))),
  seasonDetails,
  evidence: z.array(z.string()),
  infoGaps: z.array(z.string()),
  risksToReview: z.array(z.string()),
  dataConfidence,
});

export const plansResultSchema = z.object({
  status: z.enum(['placeholder', 'final']),
  modelVersion: label,
  plans: z
    .array(plan)
    .length(2)
    .refine((plans) => new Set(plans.map((p) => p.planKey)).size === 2, {
      message: 'Exactly one plan per planKey (area_plan_a, area_plan_b) is required',
    }),
});