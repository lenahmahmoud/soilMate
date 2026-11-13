import { randomUUID } from "node:crypto";
import Crop from "../models/Crop.js";
import PlanSet from "../models/PlanSet.js";
import ActivePlan from "../models/ActivePlan.js";
import { AppError } from "../utils/AppError.js";
import { OPTIONS } from "../constants/options.js";
import { AREA_PLAN_KEYS, SLOTS } from "../constants/soilmateEnums.js";
import { MY_PLAN } from "../constants/plans.js";
import { METRIC_IDS, METRICS } from "../constants/metrics.js";
import { levelOf, labelsOf } from "../constants/levels.js";
import { toImageDto } from "../mappers/cropMapper.js";
import { toActivePlanDto } from "../mappers/planMapper.js";
import { publicBaseUrl } from "../utils/publicUrl.js";
import * as scoring from "./scoring/index.js";
import { rankPlans } from "./scoring/rankPlans.js";
import {
  loadCompleteFarm,
  cropsById,
  assertSequenceAllowed,
  toScoringFarm,
  toScoringCrop,
} from "./scoringInput.js";

const SLOT_INFO = new Map(OPTIONS.slots.map((s) => [s.id, s]));
const NOTICE =
  "Scores show how well a plan fits, not what your yield or profit will be.";

// Plan 1 of the compare page: the farmer's own rotation from the Rotation Lab.
// const MY_PLAN = {
//   planKey: 'my_plan',
//   title: 'My Rotation',
//   badge: { label: 'Your Plan', tone: 'info' },
//   emptyMessage: 'Build your own rotation in the Rotation Lab to compare it here.',
// };

const invalidScoring = () =>
  new AppError(
    502,
    "SCORING_INVALID_RESPONSE",
    "The scoring service returned an unexpected answer",
  );

// 12.1 step 5: every plan has 5 metrics and 3 sequence items in slot order, and every crop exists
// and is allowed in its slot (fallow is only listed for fall_winter in the catalog).
function assertPlansValid(plans, catalogById) {
  for (const p of plans) {
    const ok =
      p.sequence?.length === 3 &&
      p.sequence.every((it, i) => it.slot === SLOTS[i]) &&
      METRIC_IDS.every((id) => p.metrics?.[id]) &&
      p.sequence.every((it) =>
        catalogById.get(it.cropId)?.slots?.includes(it.slot),
      );
    if (!ok) throw invalidScoring();
  }
}
// Contract fit row. value and note are copied exactly as received.
function toFitRow(id, m) {
  const level = m.level ?? levelOf(m.value);
  return {
    metricId: id,
    label: METRICS[id].compareLabel,
    value: m.value,
    level,
    fitLabel: labelsOf(level).fitLabel,
    note: m.note,
  };
}

function buildPlan(p, number, ranking, catalogById, baseUrl) {
  return {
    planKey: p.planKey,
    number,
    badge: p.badge,
    title: p.title,
    mainBenefit: p.mainBenefit,
    watchOut: p.watchOut,
    sequence: p.sequence.map(({ slot, cropId, roleTag }) => {
      const crop = catalogById.get(cropId);
      if (!crop) throw invalidScoring();
      const info = SLOT_INFO.get(slot);
      const { thumbUrl, alt } = toImageDto(crop, baseUrl);
      return {
        slot,
        slotLabel: info.label,
        seasonNumber: `S${info.order}`,
        crop: { id: crop.id, name: crop.name, image: { thumbUrl, alt } },
        roleTag: roleTag ?? crop.roleTag ?? null,
      };
    }),
    fit: METRIC_IDS.map((id) => toFitRow(id, p.metrics[id])),
    matchScore: ranking.matchScore,
    rank: ranking.rank,
    recommended: ranking.recommended,
    recommendedLabel: ranking.recommendedLabel,
    evidence: p.evidence,
    infoGaps: p.infoGaps,
    risksToReview: p.risksToReview,
    dataConfidence: p.dataConfidence,
    seasonDetails: p.seasonDetails, // kept so POST /plans/choose can build the ActivePlan from the saved plan
  };
}

// The plan shape buildPlan expects, made from a /v1/score result (the farmer's own rotation).
function myPlanFromScore(result, sequence) {
  if (!result.plan) throw invalidScoring();
  return {
    planKey: MY_PLAN.planKey,
    badge: MY_PLAN.badge,
    title: MY_PLAN.title,
    mainBenefit: result.plan.mainBenefit,
    watchOut: result.plan.watchOut,
    sequence: sequence.map(({ slot, crop }) => ({
      slot,
      cropId: crop.id,
      roleTag: crop.roleTag ?? null,
    })),
    metrics: Object.fromEntries(
      METRIC_IDS.map((id) => {
        const m = result.metrics[id];
        return [id, { value: m.value, level: m.level, note: m.text }]; // note = the metric text
      }),
    ),
    seasonDetails: result.seasonDetails,
    evidence: result.plan.evidence,
    infoGaps: result.plan.infoGaps,
    risksToReview: result.plan.risksToReview,
    dataConfidence: result.dataConfidence,
  };
}

// Which rotation is "the farmer's own plan": the one sent in the body, else the saved Lab draft, else none.
// A body sequence is validated strictly (422). A saved draft that no longer fits the catalog is ignored.
async function resolveMyRotation(farm, labSequence) {
  if (labSequence?.length) {
    const byId = await cropsById(labSequence.map((s) => s.cropId));
    assertSequenceAllowed(labSequence, byId);
    return {
      sequence: labSequence.map(({ slot, cropId }) => ({ slot, cropId })),
      crops: labSequence.map(({ slot, cropId }) => ({
        slot,
        crop: toScoringCrop(byId.get(cropId)),
      })),
    };
  }

  const draft = (farm.draftSequence ?? []).map(({ slot, cropId }) => ({
    slot,
    cropId,
  }));
  if (draft.length !== 3) return null;
  try {
    const byId = await cropsById(draft.map((s) => s.cropId));
    assertSequenceAllowed(draft, byId);
    return {
      sequence: draft,
      crops: draft.map(({ slot, cropId }) => ({
        slot,
        crop: toScoringCrop(byId.get(cropId)),
      })),
    };
  } catch (err) {
    if (err instanceof AppError) return null;
    throw err;
  }
}

// 12.1
export async function comparePlans(userId, labSequence) {
  const farm = await loadCompleteFarm(userId);
  const mine = await resolveMyRotation(farm, labSequence);

  const catalog = await Crop.find({}).lean();
  const catalogById = new Map(catalog.map((c) => [c.id, c]));
  const scoringFarm = toScoringFarm(farm);

  // Plans 2 and 3 (the fixed plans of the area) and the farmer's own plan are asked in parallel.
  const [areaResult, myResult] = await Promise.all([
    scoring.plans({
      requestId: randomUUID(),
      centerId: farm.centerId,
      farm: scoringFarm,
      candidateCrops: catalog.map(toScoringCrop),
    }),
    mine
      ? scoring.score({
          requestId: randomUUID(),
          centerId: farm.centerId,
          farm: scoringFarm,
          sequence: mine.crops,
        })
      : null,
  ]);

  // The schema guarantees exactly one plan per area key.
  const areaPlans = AREA_PLAN_KEYS.map((key) =>
    areaResult.plans.find((p) => p.planKey === key),
  );
  const myPlan = mine ? myPlanFromScore(myResult, mine.crops) : null;

  if (areaPlans.some((p) => !p)) throw invalidScoring();
  assertPlansValid(myPlan ? [myPlan, ...areaPlans] : areaPlans, catalogById);
  // Order of the page: my_plan (number 1), area_plan_a (2), area_plan_b (3).
  const ordered = [
    myPlan ?? { planKey: MY_PLAN.planKey, empty: true },
    ...areaPlans,
  ];
  const ranking = rankPlans(ordered, farm.priorities); // an empty plan is never ranked
  const baseUrl = publicBaseUrl();
  const plans = ordered.map((p, i) =>
    p.empty
      ? {
          planKey: MY_PLAN.planKey,
          number: i + 1,
          empty: true,
          badge: MY_PLAN.badge,
          title: MY_PLAN.title,
          message: MY_PLAN.emptyMessage,
          matchScore: null,
          rank: null,
          recommended: false,
          recommendedLabel: null,
        }
      : buildPlan(p, i + 1, ranking[i], catalogById, baseUrl),
  );

  const status = [areaResult.status, myResult?.status].includes("placeholder")
    ? "placeholder"
    : "final";

  const planSet = await PlanSet.create({
    userId,
    centerId: farm.centerId,
    farmSnapshot: {
      ...toScoringFarm(farm),
      currentCrops: [...(farm.currentCrops ?? [])],
    },
    ...(mine ? { mySequence: mine.sequence } : {}), // left out when absent: the model default applies
    status,
    modelVersion: areaResult.modelVersion,
    plans,
  });

  return {
    planSetId: String(planSet._id),
    status,
    generatedAt: new Date().toISOString(),
    goals: farm.priorities.map((id) => ({
      id,
      label: OPTIONS.priority.find((p) => p.id === id)?.label ?? id,
    })),
    plans,
    notices: [NOTICE],
  };
}

// Archive the current plan, then insert the new one. If two requests race and the unique index
// rejects the insert (11000), try once more.
async function replaceActivePlan(userId, data) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await ActivePlan.updateMany(
      { userId, archivedAt: null },
      { $set: { archivedAt: new Date() } },
    );
    try {
      return await ActivePlan.create({ ...data, userId });
    } catch (err) {
      if (err?.code !== 11000 || attempt === 1) throw err;
    }
  }
  return null; // unreachable
}

// 12.3
export async function choosePlan(userId, { planSetId, planKey, startDate }) {
  const planSet = await PlanSet.findOne({ _id: planSetId, userId }).lean();
  if (!planSet)
    throw new AppError(404, "NOT_FOUND", "Plan comparison not found");

  const plan = planSet.plans.find((p) => p.planKey === planKey);
  if (!plan)
    throw new AppError(
      404,
      "NOT_FOUND",
      "That plan is not part of this comparison",
    );
  if (plan.empty) {
    throw new AppError(
      409,
      "PLAN_NOT_AVAILABLE",
      "Build your rotation in the Rotation Lab before choosing this plan",
    );
  }

  const byId = await cropsById(plan.sequence.map((s) => s.crop.id));
  const unknownIds = [...new Set(plan.sequence.map((s) => s.crop.id))].filter(
    (id) => !byId.has(id),
  );
  if (unknownIds.length) {
    throw new AppError(
      422,
      "UNKNOWN_CROP",
      "Some crops are not available any more",
      { unknownIds },
    );
  }

  const start = startDate ?? new Date().toISOString().slice(0, 10); // default: today (UTC)
  const doc = await replaceActivePlan(userId, {
    planSetId: planSet._id,
    planKey,
    title: plan.title,
    startDate: new Date(`${start}T00:00:00.000Z`),
    status: planSet.status,
    modelVersion: planSet.modelVersion,
    sequence: plan.sequence.map((s) => ({
      slot: s.slot,
      cropId: s.crop.id,
      roleTag: s.roleTag ?? null,
    })),
    fit: plan.fit,
    seasonDetails: plan.seasonDetails ?? [],
    evidence: plan.evidence ?? [],
    infoGaps: plan.infoGaps ?? [],
    risksToReview: plan.risksToReview ?? [],
    dataConfidence: plan.dataConfidence ?? null,
  });

  return toActivePlanDto(doc.toObject(), byId);
}

// GET /plans/active (guide 13.1)
export async function getActivePlan(userId) {
  const plan = await ActivePlan.findOne({ userId, archivedAt: null }).lean();
  if (!plan) return { activePlan: null };
  const byId = await cropsById(plan.sequence.map((s) => s.cropId));
  return { activePlan: toActivePlanDto(plan, byId) };
}
