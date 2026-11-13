import Farm from "../models/Farm.js";
import ActivePlan from "../models/ActivePlan.js";
import { AppError } from "../utils/AppError.js";
import { FALLOW, normalizeSeason, rotationKey } from "../constants/rotationLab.js";
import { getRotationLabData } from "../data/loadRotationLabData.js";
import { toActivePlanDto } from "../mappers/planMapper.js";

// Archive the current plan, then insert the new one. If two requests race and the unique index
// rejects the insert (11000), try once more.
async function replaceActivePlan(userId, data) {
  const next = new ActivePlan({ ...data, userId });
  await next.validate(); // fail BEFORE anything is archived
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await ActivePlan.updateMany({ userId, archivedAt: null }, { $set: { archivedAt: new Date() } });
    try {
      return await next.save();
    } catch (err) {
      if (err?.code !== 11000 || attempt === 1) throw err;
    }
  }
  return null; // unreachable
}
// C7. The client sends only planKey (and startDate). The key is built here from the saved farm.
export async function choosePlan(userId, { planKey, startDate }) {
  const farm = await Farm.findOne({ userId }).select("centerId rotationInput").lean();
  if (!farm?.centerId) {
    throw new AppError(409, "FARM_SETUP_INCOMPLETE", "Pick your area before choosing a plan");
  }
  const winter = normalizeSeason(farm.rotationInput?.winter);
  const summer = normalizeSeason(farm.rotationInput?.summer);
  if (winter === FALLOW && summer === FALLOW) {
    throw new AppError(409, "ROTATION_NOT_SET", "Save your rotation in the Rotation Lab before choosing a plan");
  }

  const { plansByKey, meta } = getRotationLabData();
  const key = rotationKey(farm.centerId, winter, summer);
  const plan = plansByKey.get(key)?.plans?.[planKey];
  if (!plan) throw new AppError(404, "NOT_FOUND", "That plan is not available for your rotation");

  const start = startDate ?? new Date().toISOString().slice(0, 10); // default: today (UTC)
  const doc = await replaceActivePlan(userId, {
    planKey,
    key,
    input: { center: farm.centerId, winter, summer },
    startDate: new Date(`${start}T00:00:00.000Z`),
    dataVersion: meta.version,
  });
  return toActivePlanDto(doc.toObject());
}

// GET /plans/active
export async function getActivePlan(userId) {
  const plan = await ActivePlan.findOne({ userId, archivedAt: null }).lean();
  return { activePlan: plan ? toActivePlanDto(plan) : null };
}