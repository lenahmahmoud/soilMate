import { z } from 'zod';
import { METRIC_IDS } from '../../constants/metrics.js';
import { LEVELS } from '../../constants/levels.js';
import { SLOTS, PLAN_KEYS } from '../../constants/soilmateEnums.js';

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

// ---------- POST /v1/score (contract section 11). Unknown keys are stripped. ----------
const metric = z.object({
  value: score,
  level: z.enum(LEVELS).optional(), // if present it must be high | moderate | low (guide 10.5)
  text: label,
  basis: label,
  reasons: z.array(z.string()).default([]),
});

export const scoreResultSchema = z.object({
  status: z.enum(['placeholder', 'final']),
  modelVersion: label,
  metrics: z.object(Object.fromEntries(METRIC_IDS.map((id) => [id, metric]))),
  seasonDetails,
  dataConfidence,
  gaps: z.array(z.string()),
  notices: z.array(z.string()),
});

// ---------- POST /v1/plans (contract section 11). Python does NOT rank; Node does. ----------
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
  planKey: z.enum(PLAN_KEYS),
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
    .length(3)
    .refine((plans) => new Set(plans.map((p) => p.planKey)).size === 3, {
      message: 'Exactly one plan per planKey is required',
    }),
});