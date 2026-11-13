import Farm from "../models/Farm.js";
import { AppError } from "../utils/AppError.js";
import { computeSetupStatus } from "../utils/farmStatus.js";
import { toFarmDto } from "../mappers/farmMapper.js";
import { findInvalidCurrentCropIds, getCropsByIds } from "./cropService.js";
import { FALLOW, ROTATION_NEEDS_A_CROP, normalizeSeason } from "../constants/rotationLab.js";
import { getRotationLabData } from "../data/loadRotationLabData.js";
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

// C4: currentCropsDetail comes from the in-memory crop source (no database query).
function present(farm) {
  return toFarmDto(farm.toObject(), getCropsByIds(farm.currentCrops));
}

// C4: every id must be a data crop and not fallow, else 422 UNKNOWN_CROP (old US ids are rejected too).
function assertCurrentCrops(ids) {
  const unknown = findInvalidCurrentCropIds(ids);
  if (unknown.length) {
    throw new AppError(422, "UNKNOWN_CROP", "Some crops are not available", { unknownIds: unknown });
  }
}

// waterSourceOther is kept only when waterSource = other, otherwise it is null.
function normalizeWaterOther(waterSource, other) {
  if (waterSource !== "other") return null;
  const text = typeof other === "string" ? other.trim() : "";
  return text === "" ? null : text;
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
    throw new AppError(409, "FARM_SETUP_INCOMPLETE", "Pick your area before saving your farm details");
  }
  assertCurrentCrops(body.currentCrops);

  farm.currentCrops = body.currentCrops;
  farm.waterSource = body.waterSource;
  farm.waterSourceOther = normalizeWaterOther(body.waterSource, body.waterSourceOther);
  farm.waterAvailability = body.waterAvailability;
  farm.soilType = body.soilType;
  farm.equipment = body.equipment;
  farm.seasonsPerYear = body.seasonsPerYear;
  farm.priorities = body.priorities;
  // rotationInput is NOT touched here: the lab choice is saved only by PUT /farm/rotation.
  return saveWithStatus(farm);
}

export async function patchFarm(userId, patch) {
  const farm = await getOrCreateFarmDoc(userId);

  if (patch.currentCrops) assertCurrentCrops(patch.currentCrops);

  for (const key of [
    "farmName", "farmLocationText", "currentCrops", "waterAvailability", "soilType",
    "equipment", "seasonsPerYear", "priorities", "centerId",
  ]) {
    if (patch[key] !== undefined) farm[key] = patch[key];
  }
  if (patch.farmName === "") farm.farmName = null;
  if (patch.farmLocationText === "") farm.farmLocationText = null;
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
// C6: the farmer's own rotation. Needs a center, not a complete farm. Both seasons empty -> 400.
export async function setRotation(userId, { winter, summer }) {
  const w = normalizeSeason(winter);
  const s = normalizeSeason(summer);
  if (w === FALLOW && s === FALLOW) {
    const { meta } = getRotationLabData();
    throw new AppError(400, ROTATION_NEEDS_A_CROP, meta.input_rules.invalid[0].message);
  }
  const farm = await getOrCreateFarmDoc(userId);
  if (!farm.centerId) {
    throw new AppError(409, "FARM_SETUP_INCOMPLETE", "Pick your area before saving your rotation");
  }
  farm.set("rotationInput", { winter: w, summer: s });
  // Changing the rotation does NOT touch an existing ActivePlan.
  return saveWithStatus(farm);
}