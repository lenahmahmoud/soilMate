import Crop from '../models/Crop.js';
import { toCropDto } from '../mappers/cropMapper.js';
import { publicBaseUrl } from '../utils/publicUrl.js';

// use=current  -> the cards on the My Farm form (selectableAsCurrent = true)
// slot=...     -> crops allowed in that Rotation Lab slot
// use=rotation without slot -> every crop (each one is allowed in at least one slot)
export async function listCrops({ use, slot } = {}) {
  const filter = {};
  if (use === 'current') filter.selectableAsCurrent = true;
  if (slot) filter.slots = slot;

  const crops = await Crop.find(filter).select('-attributes -__v').sort({ name: 1 }).lean();
  const baseUrl = publicBaseUrl();
  return { crops: crops.map((crop) => toCropDto(crop, baseUrl)) };
}