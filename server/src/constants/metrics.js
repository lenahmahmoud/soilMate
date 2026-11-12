// The 5 scoring metrics (guide 10.4). Order matters: water, soil, erosion, practicality, economy.
export const METRIC_IDS = Object.freeze([
  'water',
  'soil',
  'erosion',
  'practicality',
  'economy',
]);

export const METRICS = Object.freeze({
  water: Object.freeze({
    id: 'water',
    title: 'Water Suitability',
    question:
      'Do the selected crops’ water requirements fit the water available on this farm?',
    compareLabel: 'Water Needs',
  }),
  soil: Object.freeze({
    id: 'soil',
    title: 'Soil Health',
    question: 'Could this crop rotation support soil fertility and soil health?',
    compareLabel: 'Soil Health',
  }),
  erosion: Object.freeze({
    id: 'erosion',
    title: 'Erosion & Ground Protection',
    question:
      'Does this rotation help reduce exposed-soil periods and potential erosion risk?',
    compareLabel: 'Soil Protection',
  }),
  practicality: Object.freeze({
    id: 'practicality',
    title: 'Practicality',
    question:
      'Does this rotation fit the farmer’s equipment, planting windows, and available resources?',
    compareLabel: 'Fits Your Farm',
  }),
  economy: Object.freeze({
    id: 'economy',
    title: 'Economy & Input Costs',
    question:
      'Is there enough information to evaluate costs, potential returns, and market suitability?',
    compareLabel: 'Costs & Earnings',
  }),
});