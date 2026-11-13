// import Farm from '../models/Farm.js';
// import Crop from '../models/Crop.js';
// import { AppError } from '../utils/AppError.js';
// import { SLOTS } from '../constants/soilmateEnums.js';
// import { OPTIONS } from '../constants/options.js';
// import { METRICS, METRIC_IDS } from '../constants/metrics.js';
// import { levelOf, labelsOf } from '../constants/levels.js';
// import { toImageDto } from '../mappers/cropMapper.js';
// import { getCenterGeometry } from './centerGeometry.js';
// import { score } from './scoring/index.js';

// const CYCLE_LABEL = '18-Month Cycle'; // [A12]

// function slotLabel(slot) {
//   const s = OPTIONS.slots.find((o) => o.id === slot);
//   return `Season ${s.order} · ${s.label}`;
// }

// // 10.1
// async function loadCompleteFarm(userId) {
//   const farm = await Farm.findOne({ userId });
//   if (!farm || farm.setupStatus !== 'complete') {
//     throw new AppError(409, 'FARM_SETUP_INCOMPLETE', 'Finish your farm setup first');
//   }
//   return farm;
// }

// function areaLabel(landArea) {
//   if (landArea?.value == null) return null;
//   const unit = landArea.unit.charAt(0).toUpperCase() + landArea.unit.slice(1);
//   return `${landArea.value} ${unit}`;
// }

// async function fieldOf(farm) {
//   const { name, bbox } = await getCenterGeometry(farm.centerId);
//   return { centerId: farm.centerId, name, bbox, areaLabel: areaLabel(farm.landArea) };
// }

// function goalsOf(farm) {
//   return farm.priorities.map((id) => ({
//     id,
//     label: OPTIONS.priority.find((p) => p.id === id)?.label ?? id,
//   }));
// }

// function emptySequence() {
//   return SLOTS.map((slot) => ({ slot, slotLabel: slotLabel(slot), crop: null }));
// }

// // A saved draft is shown only if every crop still exists and still allows its slot.
// // Otherwise the farmer starts from empty slots again.
// async function expandSaved(farm) {
//   if (farm.draftSequence.length !== 3) return null;
//   const ids = farm.draftSequence.map((it) => it.cropId);
//   const crops = await Crop.find({ id: { $in: ids } })
//     .select('id name description slots image')
//     .lean();
//   const byId = new Map(crops.map((c) => [c.id, c]));

//   const sequence = [];
//   for (const { slot, cropId } of farm.draftSequence) {
//     const crop = byId.get(cropId);
//     if (!crop || !crop.slots.includes(slot)) return null;
//     const image = toImageDto(crop);
//     sequence.push({
//       slot,
//       slotLabel: slotLabel(slot),
//       crop: {
//         id: crop.id,
//         name: crop.name,
//         description: crop.description,
//         image: { thumbUrl: image.thumbUrl, alt: image.alt },
//       },
//     });
//   }
//   return sequence;
// }

// // 10.2
// export async function getDraft(userId) {
//   const farm = await loadCompleteFarm(userId);
//   const saved = await expandSaved(farm);
//   return {
//     source: saved ? 'saved' : 'empty',
//     cycleLabel: CYCLE_LABEL,
//     goals: goalsOf(farm),
//     field: await fieldOf(farm),
//     sequence: saved ?? emptySequence(),
//   };
// }

// // 10.6: only what Python needs. No userId, guest id, farm name or location text.
// function farmForScoring(farm) {
//   return {
//     landArea: { value: farm.landArea?.value ?? null, unit: farm.landArea?.unit ?? null },
//     currentCrops: farm.currentCrops,
//     waterSource: farm.waterSource,
//     waterAvailability: farm.waterAvailability,
//     soilType: farm.soilType,
//     equipment: farm.equipment,
//     seasonsPerYear: farm.seasonsPerYear,
//     priorities: farm.priorities,
//   };
// }

// // The scoring clients read the crop attributes flat: crop.waterNeed, crop.isLegume, ...
// function cropForScoring(crop) {
//   const { family, isLegume, waterNeed, groundCover, costLevel, equipment, typicalDays } = crop.attributes;
//   return {
//     id: crop.id,
//     name: crop.name,
//     roleTag: crop.roleTag,
//     family,
//     isLegume,
//     waterNeed,
//     groundCover,
//     costLevel,
//     equipment,
//     typicalDays,
//   };
// }

// // 10.3
// export async function scoreRotation({ userId, sequence, requestId }) {
//   const farm = await loadCompleteFarm(userId);

//   const ids = [...new Set(sequence.map((it) => it.cropId))];
//   const crops = await Crop.find({ id: { $in: ids } }).lean();
//   const byId = new Map(crops.map((c) => [c.id, c]));

//   const unknownIds = ids.filter((id) => !byId.has(id));
//   if (unknownIds.length) {
//     throw new AppError(422, 'UNKNOWN_CROP', 'Some crops are not available', { unknownIds });
//   }
//   for (const { slot, cropId } of sequence) {
//     if (!byId.get(cropId).slots.includes(slot)) {
//       throw new AppError(422, 'CROP_NOT_ALLOWED_IN_SLOT', 'This crop cannot be grown in this season', {
//         slot,
//         cropId,
//       });
//     }
//   }

//   // Saved before calling Python: it stays saved if Python fails (10.3 step 6).
//   const saved = sequence.map(({ slot, cropId }) => ({ slot, cropId }));
//   farm.draftSequence = saved;
//   await farm.save();

//   const result = await score({
//     requestId,
//     centerId: farm.centerId,
//     farm: farmForScoring(farm),
//     sequence: sequence.map(({ slot, cropId }) => ({ slot, crop: cropForScoring(byId.get(cropId)) })),
//   });

//   // Labels are added; value / text / basis are never changed.
//   const metrics = METRIC_IDS.map((id) => {
//     const m = result.metrics[id];
//     const level = m.level ?? levelOf(m.value);
//     return {
//       id,
//       title: METRICS[id].title,
//       question: METRICS[id].question,
//       value: m.value,
//       level,
//       ...labelsOf(level),
//       text: m.text,
//       basis: m.basis,
//       reasons: m.reasons,
//     };
//   });

//   return {
//     status: result.status,
//     modelVersion: result.modelVersion,
//     generatedAt: new Date().toISOString(),
//     sequence: saved,
//     metrics,
//     plan: result.plan,
//     seasonDetails: result.seasonDetails,
//     dataConfidence: result.dataConfidence,
//     gaps: result.gaps,
//     notices: result.notices,
//   };
// }

import Farm from '../models/Farm.js';
import Crop from '../models/Crop.js';
import { SLOTS } from '../constants/soilmateEnums.js';
import { OPTIONS } from '../constants/options.js';
import { METRICS, METRIC_IDS } from '../constants/metrics.js';
import { levelOf, labelsOf } from '../constants/levels.js';
import { toImageDto } from '../mappers/cropMapper.js';
import { getCenterGeometry } from './centerGeometry.js';
import { score } from './scoring/index.js';
import {
  loadCompleteFarm,
  cropsById,
  assertSequenceAllowed,
  toScoringFarm,
  toScoringCrop,
} from './scoringInput.js';

const CYCLE_LABEL = '18-Month Cycle'; // [A12]

function slotLabel(slot) {
  const s = OPTIONS.slots.find((o) => o.id === slot);
  return `Season ${s.order} · ${s.label}`;
}

function areaLabel(landArea) {
  if (landArea?.value == null) return null;
  const unit = landArea.unit.charAt(0).toUpperCase() + landArea.unit.slice(1);
  return `${landArea.value} ${unit}`;
}

async function fieldOf(farm) {
  const { name, bbox } = await getCenterGeometry(farm.centerId);
  return { centerId: farm.centerId, name, bbox, areaLabel: areaLabel(farm.landArea) };
}

function goalsOf(farm) {
  return farm.priorities.map((id) => ({
    id,
    label: OPTIONS.priority.find((p) => p.id === id)?.label ?? id,
  }));
}

function emptySequence() {
  return SLOTS.map((slot) => ({ slot, slotLabel: slotLabel(slot), crop: null }));
}

// A saved draft is shown only if every crop still exists and still allows its slot.
// Otherwise the farmer starts from empty slots again.
async function expandSaved(farm) {
  if ((farm.draftSequence ?? []).length !== 3) return null;
  const ids = farm.draftSequence.map((it) => it.cropId);
  const crops = await Crop.find({ id: { $in: ids } })
    .select('id name description slots image')
    .lean();
  const byId = new Map(crops.map((c) => [c.id, c]));

  const sequence = [];
  for (const { slot, cropId } of farm.draftSequence) {
    const crop = byId.get(cropId);
    if (!crop || !crop.slots.includes(slot)) return null;
    const image = toImageDto(crop);
    sequence.push({
      slot,
      slotLabel: slotLabel(slot),
      crop: {
        id: crop.id,
        name: crop.name,
        description: crop.description,
        image: { thumbUrl: image.thumbUrl, alt: image.alt },
      },
    });
  }
  return sequence;
}

// 10.2
export async function getDraft(userId) {
  const farm = await loadCompleteFarm(userId); // 10.1 guard (409 FARM_SETUP_INCOMPLETE)
  const saved = await expandSaved(farm);
  return {
    source: saved ? 'saved' : 'empty',
    cycleLabel: CYCLE_LABEL,
    goals: goalsOf(farm),
    field: await fieldOf(farm),
    sequence: saved ?? emptySequence(),
  };
}

// 10.3
export async function scoreRotation({ userId, sequence, requestId }) {
  const farm = await loadCompleteFarm(userId);

  // step 2: same checks and the same 422 codes that POST /plans/compare uses for a labSequence
  const byId = await cropsById(sequence.map((it) => it.cropId));
  assertSequenceAllowed(sequence, byId);

  // step 3: saved before calling Python, so it stays saved if Python fails (step 6)
  const saved = sequence.map(({ slot, cropId }) => ({ slot, cropId }));
  await Farm.updateOne({ userId }, { $set: { draftSequence: saved } });

  // step 4: the same farm and crop payloads that /plans/compare sends (A32)
  const result = await score({
    requestId,
    centerId: farm.centerId,
    farm: toScoringFarm(farm),
    sequence: sequence.map(({ slot, cropId }) => ({ slot, crop: toScoringCrop(byId.get(cropId)) })),
  });

  // step 5: labels are added; value / text / basis are never changed
  const metrics = METRIC_IDS.map((id) => {
    const m = result.metrics[id];
    const level = m.level ?? levelOf(m.value);
    return {
      id,
      title: METRICS[id].title,
      question: METRICS[id].question,
      value: m.value,
      level,
      ...labelsOf(level),
      text: m.text,
      basis: m.basis,
      reasons: m.reasons,
    };
  });

  return {
    status: result.status,
    modelVersion: result.modelVersion,
    generatedAt: new Date().toISOString(),
    sequence: saved,
    metrics,
    plan: result.plan,
    seasonDetails: result.seasonDetails,
    dataConfidence: result.dataConfidence,
    gaps: result.gaps,
    notices: result.notices,
  };
}