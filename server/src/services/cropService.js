import { getRotationLabData } from "../data/loadRotationLabData.js";
import { FALLOW } from "../constants/rotationLab.js";
import { toCropDto } from "../mappers/cropMapper.js";
import { publicBaseUrl } from "../utils/publicUrl.js";

// The crop source is the Rotation Lab data, joined once at boot (C2). No database.
//   use=current   -> the 7 crops (no fallow)
//   use=rotation  -> the 7 crops + fallow (default)
//   season        -> only that season (fallow is added back when use=rotation)
// The order of crop_catalog.json is kept; fallow is always last.
export function listCrops({ use = "rotation", season } = {}) {
  const { cropsById, cropOrder } = getRotationLabData();
  let crops = cropOrder.map((id) => cropsById.get(id));
  if (season) crops = crops.filter((c) => c.season === season);
  if (use === "rotation") crops = [...crops, cropsById.get(FALLOW)];
  const baseUrl = publicBaseUrl();
  return { crops: crops.map((c) => toCropDto(c, baseUrl)) };
}

// Internal crop records (with traits) in the order of `ids`; unknown ids are skipped.
export function getCropsByIds(ids) {
  const { cropsById } = getRotationLabData();
  return ids.map((id) => cropsById.get(id)).filter(Boolean);
}

// C4: a current crop must be one of the 7 data crops; fallow is not a crop the farmer grows.
export function findInvalidCurrentCropIds(ids) {
  const { cropsById } = getRotationLabData();
  return ids.filter((id) => id === FALLOW || !cropsById.has(id));
}