import { publicBaseUrl } from '../utils/publicUrl.js';

export function toImageDto(crop, baseUrl = publicBaseUrl()) {
  return {
    url: `${baseUrl}/static/crops/${crop.image.file}`,
    thumbUrl: `${baseUrl}/static/crops/thumb/${crop.image.thumbFile}`,
    alt: crop.image.alt,
  };
}

// Whitelist: `attributes` (internal scoring data) can never leave through this function.
export function toCropDto(crop, baseUrl = publicBaseUrl()) {
  return {
    id: crop.id,
    name: crop.name,
    subtitle: crop.subtitle ?? '',
    category: crop.category,
    roleTag: crop.roleTag,
    benefitTag: crop.benefitTag ?? null,
    description: crop.description,
    slots: crop.slots,
    selectableAsCurrent: Boolean(crop.selectableAsCurrent),
    image: toImageDto(crop, baseUrl),
    calendar: {
      plantingLabel: crop.calendar?.plantingLabel ?? null,
      harvestLabel: crop.calendar?.harvestLabel ?? null,
    },
  };
}