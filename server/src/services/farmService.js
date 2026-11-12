import Farm from '../models/Farm.js';
import Crop from '../models/Crop.js';
import { AppError } from '../utils/AppError.js';
import { computeSetupStatus } from '../utils/farmStatus.js';
import { toFarmDto } from '../mappers/farmMapper.js';

// 9.1: one farm per user, created empty on first use. The unique userId index makes two
// parallel first requests safe: the loser gets E11000 and simply reads the winner's farm.
async function getOrCreateFarmDoc(userId) {
  const existing = await Farm.findOne({ userId });
  if (existing) return existing;
  try {
    return await Farm.create({ userId });
  } catch (err) {
    if (err?.code === 11000) return Farm.findOne({ userId });
    throw err;
  }
}

// 9.6: one $in query for the thumbnails of the current crops.
async function present(farm) {
  const crops = farm.currentCrops.length
    ? await Crop.find({ id: { $in: farm.currentCrops } })
        .select('id name image')
        .lean()
    : [];
  return toFarmDto(farm.toObject(), crops);
}

// 9.4: every id must exist in the catalog AND be selectable as a current crop.
async function assertSelectableCrops(ids) {
  const found = await Crop.find({ id: { $in: ids }, selectableAsCurrent: true })
    .select('id')
    .lean();
  const ok = new Set(found.map((c) => c.id));
  const unknown = ids.filter((id) => !ok.has(id));
  if (unknown.length) {
    throw new AppError(422, 'UNKNOWN_CROP', 'Some crops are not available', { unknownIds: unknown });
  }
}

// waterSourceOther is kept only when waterSource = other, otherwise it is null.
function normalizeWaterOther(waterSource, other) {
  if (waterSource !== 'other') return null;
  const text = typeof other === 'string' ? other.trim() : '';
  return text === '' ? null : text;
}

async function saveWithStatus(farm) {
  farm.setupStatus = computeSetupStatus(farm); // recomputed after EVERY write
  await farm.save();
  return present(farm);
}

export async function getFarm(userId) {
  const farm = await getOrCreateFarmDoc(userId);
  return present(farm);
}

export async function setCenter(userId, centerId) {
  const farm = await getOrCreateFarmDoc(userId);
  farm.centerId = centerId;
  return saveWithStatus(farm);
}

export async function putFarm(userId, body) {
  const farm = await getOrCreateFarmDoc(userId);
  if (!farm.centerId) {
    throw new AppError(409, 'FARM_SETUP_INCOMPLETE', 'Pick your area before saving your farm details');
  }
  await assertSelectableCrops(body.currentCrops);

  farm.currentCrops = body.currentCrops;
  farm.waterSource = body.waterSource;
  farm.waterSourceOther = normalizeWaterOther(body.waterSource, body.waterSourceOther);
  farm.waterAvailability = body.waterAvailability;
  farm.soilType = body.soilType;
  farm.equipment = body.equipment;
  farm.seasonsPerYear = body.seasonsPerYear;
  farm.priorities = body.priorities;
  // draftSequence is NOT reset (9.4): plans are recomputed on demand.
  return saveWithStatus(farm);
}

export async function patchFarm(userId, patch) {
  const farm = await getOrCreateFarmDoc(userId);

  if (patch.currentCrops) await assertSelectableCrops(patch.currentCrops);

  for (const key of [
    'farmName', 'farmLocationText', 'currentCrops', 'waterAvailability', 'soilType',
    'equipment', 'seasonsPerYear', 'priorities', 'centerId',
  ]) {
    if (patch[key] !== undefined) farm[key] = patch[key];
  }
  if (patch.farmName === '') farm.farmName = null;
  if (patch.farmLocationText === '') farm.farmLocationText = null;
  if (patch.landArea) {
    farm.landArea.value = patch.landArea.value;
    farm.landArea.unit = patch.landArea.unit;
  }

  if (patch.waterSource !== undefined) farm.waterSource = patch.waterSource;
  if (patch.waterSource !== undefined || patch.waterSourceOther !== undefined) {
    const other = patch.waterSourceOther !== undefined ? patch.waterSourceOther : farm.waterSourceOther;
    farm.waterSourceOther = normalizeWaterOther(farm.waterSource, other);
  }
  return saveWithStatus(farm);
}