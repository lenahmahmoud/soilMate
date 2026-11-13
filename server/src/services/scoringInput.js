import Farm from '../models/Farm.js';
import Crop from '../models/Crop.js';
import { AppError } from '../utils/AppError.js';

// Guide 10.1 guard. Lean farm: plain object, never created here.
export async function loadCompleteFarm(userId) {
  const farm = await Farm.findOne({ userId }).lean();
  if (!farm || farm.setupStatus !== 'complete') {
    throw new AppError(409, 'FARM_SETUP_INCOMPLETE', 'Finish your farm details first');
  }
  return farm;
}

export async function cropsById(ids) {
  const crops = await Crop.find({ id: { $in: [...new Set(ids)] } }).lean();
  return new Map(crops.map((c) => [c.id, c]));
}

// Same checks as POST /rotation/score (guide 10.3 step 2).
export function assertSequenceAllowed(sequence, byId) {
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
}

// Only the fields the scoring service may see (no user ids, guest flags, farm name...).
export function toScoringFarm(farm) {
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

// name, roleTag and slots are used by the mock; the Python client keeps only the fields of the contract.
export function toScoringCrop(crop) {
  const a = crop.attributes;
  return {
    id: crop.id,
    name: crop.name,
    roleTag: crop.roleTag,
    slots: [...(crop.slots ?? [])],
    family: a.family,
    isLegume: a.isLegume,
    waterNeed: a.waterNeed,
    groundCover: a.groundCover,
    costLevel: a.costLevel,
    equipment: [...(a.equipment ?? [])],
    typicalDays: a.typicalDays,
  };
}