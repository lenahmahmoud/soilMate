import Farm from '../models/Farm.js';
import ActivePlan from '../models/ActivePlan.js';
import { CENTERS } from '../constants/centers.js';
import { OPTIONS } from '../constants/options.js';
import { labelsOf, levelOf } from '../constants/levels.js';
import { toActivePlanDto } from '../mappers/planMapper.js';
import { seasonProgress } from '../utils/seasonProgress.js';
import { getOverview } from './layerService.js';
import { cropsById } from './scoringInput.js';

const SLOT_INFO = new Map(OPTIONS.slots.map((s) => [s.id, s]));

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

// "S1: Winter Rye (Fall / Winter)"
function seasonLabel(slot, crop) {
  const info = SLOT_INFO.get(slot);
  return `S${info.order}: ${crop.name} (${info.label})`;
}

// One row per season that still has its crop in the catalog. `key` is groundCover or waterDemand.
function meterSeasons(plan, cropBySlot, key) {
  return (plan.seasonDetails ?? [])
    .filter((d) => cropBySlot.has(d.slot))
    .map((d) => ({
      slot: d.slot,
      cropId: d.cropId,
      label: seasonLabel(d.slot, cropBySlot.get(d.slot)),
      value: d[key].value,
      meterLabel: d[key].label,
      note: d[key].note,
    }));
}

function protectionOverall(plan) {
  const row = (plan.fit ?? []).find((f) => f.metricId === 'erosion');
  if (!row) return null;
  const level = row.level ?? levelOf(row.value);
  return { value: row.value, level, levelLabel: labelsOf(level).levelLabel, fitLabel: row.fitLabel, note: row.note };
}

// Computed by Node from the plan dates and the crops' typical days, never from data files. Always an estimate.
function progressOf(plan, items, byId, today) {
  if (!items.length) return null;
  const durations = items.map((i) => byId.get(i.cropId).attributes?.typicalDays ?? 0);
  const p = seasonProgress({ startDate: plan.startDate, durations, today });
  const item = items[p.currentIndex];
  const crop = byId.get(item.cropId);
  const info = SLOT_INFO.get(item.slot);
  return {
    state: p.state, // not_started | in_progress | completed
    currentSlot: item.slot,
    seasonLabel: `Season ${info.order} · ${info.label}`,
    crop: { id: crop.id, name: crop.name },
    dayOfSeason: p.dayOfSeason,
    totalDays: p.totalDays,
    percent: p.percent,
    isEstimate: true,
  };
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

  const byId = await cropsById(planDoc.sequence.map((s) => s.cropId));
  const items = planDoc.sequence.filter((i) => byId.has(i.cropId)); // removed crops are skipped, as in GET /plans/active
  const cropBySlot = new Map(items.map((i) => [i.slot, byId.get(i.cropId)]));

  out.seasonProgress = progressOf(planDoc, items, byId, today);
  out.protection = {
    overall: protectionOverall(planDoc),
    seasons: meterSeasons(planDoc, cropBySlot, 'groundCover'),
  };
  out.waterBySeason = { seasons: meterSeasons(planDoc, cropBySlot, 'waterDemand') };
  out.plan = toActivePlanDto(planDoc, byId, { today }); // same object as GET /plans/active
  return out;
}