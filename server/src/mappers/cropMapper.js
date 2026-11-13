import { publicBaseUrl } from "../utils/publicUrl.js";

// C2/C5: the JSON has `image: null`, so the URLs are BUILT from the crop id.
// The file may not exist yet (4 crops wait for images): the frontend shows a placeholder.
export function toImageDto(crop, baseUrl = publicBaseUrl()) {
  return {
    url: `${baseUrl}/static/crops/${crop.id}.webp`,
    thumbUrl: `${baseUrl}/static/crops/thumb/${crop.id}.webp`,
    alt: crop.name,
  };
}

// Whitelist: the traits from crops.json (and the old appId) can never leave through this function.
export function toCropDto(crop, baseUrl = publicBaseUrl()) {
  return {
    id: crop.id,
    name: crop.name,
    season: crop.season,
    roleTags: [...crop.roleTags],
    description: crop.description,
    image: toImageDto(crop, baseUrl),
  };
}