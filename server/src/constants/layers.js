// Explore Land map layers (contract section 6). The order here is the order shown in the UI.
export const LAYERS = Object.freeze([
  { id: 'overview', label: 'Field Overview', order: 1, available: true },
  { id: 'soil_moisture', label: 'Soil Moisture', order: 2, available: true },
  { id: 'crop_health', label: 'Crop Health (NDVI)', order: 3, available: true },
  { id: 'heat_stress', label: 'Heat Stress', order: 4, available: true },
  { id: 'erosion_risk', label: 'Erosion Risk', order: 5, available: false, unavailableReason: 'Not available yet' },
]);

export const COVERAGE_NOTE = 'We currently cover Desouk, Sidi Salem and Baltim.';

// Map fill per soil-moisture state (contract assumption A9: constants, not from the data files).
export const SM_FILL_HEX = Object.freeze({
  dry: '#D9B26F',
  normal: '#A8D5A2',
  wet: '#8EC5E8',
  no_data: '#CFCFCF',
});

// NDVI level -> face. The "low" label is not in the data file (no center is "low" today), so it comes from the contract.
export const NDVI_LEVEL_LABELS = Object.freeze({ low: 'Nearly bare', mid: 'Moderate green', good: 'Healthy green' });
export const NDVI_FACE = Object.freeze({ low: 'sad', mid: 'neutral', good: 'happy' });

// Land-risk indicator labels (the atlas "signs" have no label field, only a question). Salinity is not measured.
export const SIGN_LABELS = Object.freeze({
  vegetation: 'Vegetation',
  soil_moisture: 'Soil moisture',
  heat: 'Heat',
  salinity: 'Coast exposure (distance only)',
});
export const LAND_RISK_TITLE = 'Land risk (desertification screening)';
export const LAND_RISK_NOTICE = 'A screening result, not a diagnosis. Salinity is not measured, only distance from the coast.';