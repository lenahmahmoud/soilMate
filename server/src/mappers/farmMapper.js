import { toImageDto } from './cropMapper.js';
import { publicBaseUrl } from '../utils/publicUrl.js';

// Whitelist: only the contract's Farm object leaves the server (no draftSequence, userId, __v).
// `crops` are the Crop documents for farm.currentCrops (one $in query done by the service).
export function toFarmDto(farm, crops = [], baseUrl = publicBaseUrl()) {
  const byId = new Map(crops.map((c) => [c.id, c]));
  const currentCropsDetail = (farm.currentCrops ?? [])
    .filter((id) => byId.has(id)) // a crop removed from the catalog is skipped, not an error
    .map((id) => {
      const crop = byId.get(id);
      const { thumbUrl, alt } = toImageDto(crop, baseUrl);
      return { id: crop.id, name: crop.name, image: { thumbUrl, alt } };
    });

  return {
    id: String(farm._id),
    setupStatus: farm.setupStatus,
    centerId: farm.centerId ?? null,
    farmName: farm.farmName ?? null,
    farmLocationText: farm.farmLocationText ?? null,
    landArea:
      farm.landArea?.value == null
        ? null
        : { value: farm.landArea.value, unit: farm.landArea.unit },
    currentCrops: farm.currentCrops ?? [],
    currentCropsDetail,
    waterSource: farm.waterSource ?? null,
    waterSourceOther: farm.waterSourceOther ?? null,
    waterAvailability: farm.waterAvailability ?? null,
    soilType: farm.soilType ?? null,
    equipment: farm.equipment ?? [],
    seasonsPerYear: farm.seasonsPerYear ?? null,
    priorities: farm.priorities ?? [],
    updatedAt: farm.updatedAt,
  };
}