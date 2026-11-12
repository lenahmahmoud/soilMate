// Section 9.3: recompute after EVERY farm write.
//   none            no centerId
//   complete        centerId + at least 1 current crop + waterSource + waterAvailability + soilType
//                   + seasonsPerYear + at least 1 priority   (equipment may be empty)
//   center_selected otherwise
export function computeSetupStatus(farm) {
  if (!farm.centerId) return 'none';
  const complete =
    (farm.currentCrops?.length ?? 0) >= 1 &&
    Boolean(farm.waterSource) &&
    Boolean(farm.waterAvailability) &&
    Boolean(farm.soilType) &&
    Boolean(farm.seasonsPerYear) &&
    (farm.priorities?.length ?? 0) >= 1;
  return complete ? 'complete' : 'center_selected';
}