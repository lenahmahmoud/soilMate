import Farm from '../models/Farm.js';
import ActivePlan from '../models/ActivePlan.js';
import { CENTERS } from '../constants/centers.js';
import { FALLOW, SEASON_LABELS } from '../constants/rotationLab.js';
import { getRotationLabData } from '../data/loadRotationLabData.js';
import { toActivePlanDto } from '../mappers/planMapper.js';
import { labelsOf } from '../constants/levels.js';
import { getOverview } from './layerService.js';

const DAY_MS = 86_400_000;
const utcMidnight = (d) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const SEASON_ORDER = Object.freeze({ winter: 1, summer: 2 });
// ui_text.json: soil_score_bands (high_from / low_below).
const SOIL_HIGH_SCORE = 0.75;
const SOIL_LOW_SCORE = 0.45;
const WATER_LABELS = Object.freeze({
  low: 'Low evaporative demand',
  medium: 'Moderate evaporative demand',
  high: 'High evaporative demand',
});

// Pieces of the area overview that the dashboard shows (guide 13.2).
function landOf(centerId) {
  const o = getOverview(centerId);
  if (!o) return null;
  return {
    tiles: o.tiles,
    soilMoisture: o.soilMoisture,
    landRisk: o.landRisk,
    dataThrough: o.dataThrough,
    areaWarning: o.areaWarning,
  };
}

// The saved rotation as a sequence of planted seasons (winter, summer), fallow seasons skipped.
function seasonSequence(rotation) {
  const { cropsById } = getRotationLabData();
  const out = [];
  for (const slot of ['winter', 'summer']) {
    const cropId = rotation?.[slot];
    if (!cropId || cropId === FALLOW) continue;
    const crop = cropsById.get(cropId);
    if (!crop) continue;
    const duration = crop.traits?.season_length_days ?? crop.season_length_days;
    if (duration == null) continue;
    out.push({ slot, cropId, cropName: crop.name, duration });
  }
  return out;
}

// Guide 13.2: today is the UTC date, elapsed = days since the plan startDate. The crop lengths come
// from the Rotation Lab data (crops.json season_length_days). isEstimate is always true.
function seasonProgressOf(farm, planDoc, today = new Date()) {
  const seq = seasonSequence(farm?.rotationInput ?? planDoc?.input ?? null);
  if (!seq.length || !planDoc?.startDate) return null;

  const start = new Date(planDoc.startDate);
  const elapsed = Math.round((utcMidnight(today) - utcMidnight(start)) / DAY_MS);
  const first = seq[0];

  if (elapsed < 0) {
    return {
      state: 'not_started',
      currentSlot: first.slot,
      currentCropName: first.cropName,
      dayOfSeason: 0,
      totalDays: first.duration,
      percent: 0,
      isEstimate: true,
    };
  }

  let rest = elapsed;
  let current = null;
  for (const s of seq) {
    if (rest < s.duration) {
      current = { slot: s.slot, cropName: s.cropName, dayOfSeason: rest + 1, totalDays: s.duration };
      break;
    }
    rest -= s.duration;
  }

  if (current) {
    return {
      state: 'in_progress',
      currentSlot: current.slot,
      currentCropName: current.cropName,
      dayOfSeason: current.dayOfSeason,
      totalDays: current.totalDays,
      percent: Math.round((100 * current.dayOfSeason) / current.totalDays),
      isEstimate: true,
    };
  }

  const last = seq[seq.length - 1];
  return {
    state: 'completed',
    currentSlot: last.slot,
    currentCropName: last.cropName,
    dayOfSeason: last.duration,
    totalDays: last.duration,
    percent: 100,
    isEstimate: true,
  };
}

// The planted seasons of a resolved Rotation Lab plan (the plan content), fallow seasons skipped.
function planSeasons(content) {
  const rotation = content?.rotation ?? {};
  const out = [];
  for (const slot of ['winter', 'summer']) {
    const cropId = rotation[slot];
    if (!cropId || cropId === FALLOW) continue;
    const crop = getRotationLabData().cropsById.get(cropId);
    if (!crop) continue;
    out.push({ slot, cropId, cropName: crop.name, crop });
  }
  return out;
}

function cropMeanEtc(crop) {
  return crop.traits?.mean_etc_mm ?? crop.mean_etc_mm ?? null;
}
function cropWaterNeedClass(crop) {
  return crop.traits?.water_need_class ?? crop.water_need_class ?? null;
}

function seasonLabelOf(slot, cropName) {
  return `S${SEASON_ORDER[slot]}: ${cropName} (${SEASON_LABELS[slot]})`;
}

// 13.2: protection comes from the chosen plan (the soil score of the plan gives the overall level).
function protectionOf(content) {
  if (!content) return null;
  const numbers = content.numbers ?? {};
  const score = typeof numbers.soil_score === 'number' ? numbers.soil_score : null;
  const level = score === null ? null : score >= SOIL_HIGH_SCORE ? 'high' : score < SOIL_LOW_SCORE ? 'low' : 'moderate';
  const overall = level === null ? null : { level, fitLabel: labelsOf(level).fitLabel };

  const seasons = planSeasons(content).map(({ slot, crop }) => ({
    slot,
    seasonLabel: seasonLabelOf(slot, crop.name),
    label: `${crop.name} Cover Canopy`,
    value: null, // the delivered plan content carries no per-season ground-cover percentage
    note: numbers.bare_days_yr == null ? null : `Days with no crop: ${numbers.bare_days_yr}`,
  }));

  return { title: 'Soil & Ground Cover Resilience', seasons, overall };
}

// 13.2: water needs per season of the chosen plan.
function waterOf(content) {
  if (!content) return null;
  const seasons = planSeasons(content).map(({ slot, crop }) => {
    const cls = cropWaterNeedClass(crop);
    return {
      slot,
      seasonLabel: seasonLabelOf(slot, crop.name),
      value: cropMeanEtc(crop),
      label: WATER_LABELS[cls] ?? cls,
    };
  });
  return { title: 'Water Needs by Season', seasons };
}

// 13.2
export async function getDashboard(userId, { today = new Date() } = {}) {
  const farm = await Farm.findOne({ userId }).lean();
  const center = CENTERS.find((c) => c.id === farm?.centerId) ?? null;
  const planDoc = await ActivePlan.findOne({ userId, archivedAt: null }).lean();

  const out = {
    header: {
      farmName: farm?.farmName ?? null,
      centerId: center?.id ?? null,
      centerName: center?.name ?? null,
      locationLabel: center ? `${center.name} · ${center.governorate}` : null,
    },
    land: center ? landOf(center.id) : null,
    hasActivePlan: Boolean(planDoc),
    seasonProgress: null,
    protection: null,
    waterBySeason: null,
    plan: null,
    reportsAvailable: Boolean(center),
  };
  if (!planDoc) return out;

  const plan = toActivePlanDto(planDoc);
  out.plan = plan;
  out.protection = protectionOf(plan.plan);
  out.waterBySeason = waterOf(plan.plan);
  out.seasonProgress = seasonProgressOf(farm, planDoc, today);
  return out;
}
