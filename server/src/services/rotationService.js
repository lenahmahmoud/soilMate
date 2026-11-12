import { randomUUID } from 'node:crypto';
import Farm from '../models/Farm.js';
import Crop from '../models/Crop.js';
import { AppError } from '../utils/AppError.js';
import { OPTIONS } from '../constants/options.js';
import { SLOTS } from '../constants/soilmateEnums.js';
import { METRIC_IDS, METRICS } from '../constants/metrics.js';
import { levelOf, labelsOf } from '../constants/levels.js';
import { toImageDto } from '../mappers/cropMapper.js';
import { publicBaseUrl } from '../utils/publicUrl.js';
import * as scoring from './scoring/index.js';
import { getCenterGeometry } from './centerGeometry.js';

const CYCLE_LABEL = '18-Month Cycle'; // [A12] keep until the agronomy owner confirms
const SLOT_INFO = new Map(OPTIONS.slots.map((s) => [s.id, s]));

// 10.1 guard. Lean farm: plain object, never created here.
async function loadCompleteFarm(userId) {
  const farm = await Farm.findOne({ userId }).lean();
  if (!farm || farm.setupStatus !== 'complete') {
    throw new AppError(409, 'FARM_SETUP_INCOMPLETE', 'Finish your farm details first');
  }
  return farm;
}

async function cropsById(ids) {
  const crops = await Crop.find({ id: { $in: [...new Set(ids)] } }).lean();
  return new Map(crops.map((c) => [c.id, c]));
}

async function defaultPicks() {
  const defaults = await Crop.find({ defaultForSlot: { $in: SLOTS } })
    .select('id defaultForSlot')
    .lean();
  return SLOTS.map((slot) => {
    const crop = defaults.find((c) => c.defaultForSlot === slot);
    if (!crop) throw new AppError(500, 'INTERNAL', `No default crop is set for ${slot}`);
    return { slot, cropId: crop.id };
  });
}

// "saved" only when the draft has 3 items and every crop still exists; otherwise the default.
async function resolveSequence(farm) {
  const saved = (farm.draftSequence ?? []).map(({ slot, cropId }) => ({ slot, cropId }));
  if (saved.length === 3) {
    const byId = await cropsById(saved.map((s) => s.cropId));
    if (saved.every((s) => byId.has(s.cropId))) return { source: 'saved', picks: saved, byId };
  }
  const picks = await defaultPicks();
  return { source: 'default', picks, byId: await cropsById(picks.map((p) => p.cropId)) };
}

function areaLabel(landArea) {
  if (landArea?.value == null) return null;
  return `${landArea.value} ${landArea.unit === 'acres' ? 'Acres' : 'Hectares'}`;
}

// 10.2
export async function getDraft(userId) {
  const farm = await loadCompleteFarm(userId);
  const { source, picks, byId } = await resolveSequence(farm);
  const baseUrl = publicBaseUrl();
  const geometry = await getCenterGeometry(farm.centerId);

  return {
    source,
    goals: farm.priorities.map((id) => ({
      id,
      label: OPTIONS.priority.find((p) => p.id === id)?.label ?? id,
    })),
    cycleLabel: CYCLE_LABEL,
    field: {
      centerId: farm.centerId,
      name: geometry.name,
      bbox: geometry.bbox,
      areaLabel: areaLabel(farm.landArea),
    },
    sequence: picks.map(({ slot, cropId }) => {
      const crop = byId.get(cropId);
      const { thumbUrl, alt } = toImageDto(crop, baseUrl);
      const info = SLOT_INFO.get(slot);
      return {
        slot,
        slotLabel: `Season ${info.order} · ${info.label}`,
        crop: { id: crop.id, name: crop.name, description: crop.description, image: { thumbUrl, alt } },
      };
    }),
  };
}

// Only the fields the scoring service may see (no ids of the user, guest flags, farm name...).
function toScoringFarm(farm) {
  return {
    waterSource: farm.waterSource,
    waterAvailability: farm.waterAvailability,
    soilType: farm.soilType,
    equipment: [...(farm.equipment ?? [])],
    seasonsPerYear: farm.seasonsPerYear,
    priorities: [...(farm.priorities ?? [])],
    landArea: farm.landArea?.value == null ? null : { value: farm.landArea.value, unit: farm.landArea.unit },
  };
}

function toMetric(id, m) {
  const level = m.level ?? levelOf(m.value);
  const { levelLabel, fitLabel } = labelsOf(level);
  const { title, question } = METRICS[id];
  // value, text and basis are copied exactly as received.
  return { id, title, question, value: m.value, level, levelLabel, fitLabel, text: m.text, basis: m.basis, reasons: m.reasons };
}

// 10.3
export async function scoreRotation(userId, sequence) {
  const farm = await loadCompleteFarm(userId);

  const byId = await cropsById(sequence.map((s) => s.cropId));
  const unknownIds = [...new Set(sequence.map((s) => s.cropId))].filter((id) => !byId.has(id));
  if (unknownIds.length) {
    throw new AppError(422, 'UNKNOWN_CROP', 'Some crops are not available', { unknownIds });
  }
  for (const { slot, cropId } of sequence) {
    if (!byId.get(cropId).slots.includes(slot)) {
      throw new AppError(422, 'CROP_NOT_ALLOWED_IN_SLOT', 'This crop cannot be planted in that season', {
        slot,
        cropId,
      });
    }
  }

  // Save the draft first (guide order). updateOne = no race with other farm saves.
  await Farm.updateOne({ _id: farm._id }, { $set: { draftSequence: sequence } });

  const result = await scoring.score({
    requestId: randomUUID(),
    centerId: farm.centerId,
    farm: toScoringFarm(farm),
    sequence: sequence.map(({ slot, cropId }) => {
      const crop = byId.get(cropId);
      const a = crop.attributes;
      return {
        slot,
        crop: {
          id: crop.id,
          name: crop.name, // used by the mock for its sentences; the Python client drops it
          family: a.family,
          isLegume: a.isLegume,
          waterNeed: a.waterNeed,
          groundCover: a.groundCover,
          costLevel: a.costLevel,
          equipment: [...a.equipment],
          typicalDays: a.typicalDays,
        },
      };
    }),
  });

  return {
    status: result.status,
    modelVersion: result.modelVersion,
    generatedAt: new Date().toISOString(),
    sequence: sequence.map(({ slot, cropId }) => ({ slot, cropId })),
    metrics: METRIC_IDS.map((id) => toMetric(id, result.metrics[id])),
    seasonDetails: result.seasonDetails,
    dataConfidence: result.dataConfidence,
    gaps: result.gaps,
    notices: result.notices,
  };
}