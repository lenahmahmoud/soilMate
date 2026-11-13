// Ranking weights (guide 12.2). Every metric starts at BASE_WEIGHT; each selected priority adds PRIORITY_BONUS.
export const BASE_WEIGHT = 1;
export const PRIORITY_BONUS = 2;

export const PRIORITY_TO_METRICS = Object.freeze({
  save_water: Object.freeze(['water']),
  improve_soil: Object.freeze(['soil']),
  protect_land: Object.freeze(['erosion']),
  manage_costs: Object.freeze(['economy']),
  earn_more: Object.freeze(['economy']),
});

// Label for the rank-1 plan, taken from the FIRST selected priority.
export const RECOMMENDED_LABELS = Object.freeze({
  save_water: 'Recommended for Water Goals',
  improve_soil: 'Recommended for Soil Goals',
  protect_land: 'Recommended for Land Protection',
  manage_costs: 'Recommended for Cost Goals',
  earn_more: 'Recommended for Income Goals',
});