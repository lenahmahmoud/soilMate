// Exactly as in contract section 3. The test file checks every id against soilmateEnums.js,
// so the options and the validation lists can never disagree.
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(deepFreeze);
  }
  return value;
}

export const OPTIONS = deepFreeze({
  waterSource: [
    { id: 'rain', label: 'Rain', hint: 'Rainfed pure' },
    { id: 'river_canal', label: 'River / Canal', hint: 'Surface diverted' },
    { id: 'groundwater', label: 'Groundwater', hint: 'Deep tube well' },
    { id: 'mixed', label: 'Mixed Sources', hint: 'Rain + Supplemental' },
    { id: 'other', label: 'Other', hint: 'Retention pond' },
  ],
  waterAvailability: [
    { id: 'often_limited', label: 'Often Limited', hint: 'Rain-dependent risk' },
    { id: 'sometimes_limited', label: 'Sometimes Limited', hint: 'Seasonal dry spells' },
    { id: 'usually_enough', label: 'Usually Enough', hint: 'Consistent security' },
  ],
  soilType: [
    {
      id: 'mostly_sandy',
      label: 'Mostly Sandy',
      hint: 'Fast drainage, light density, warms up rapidly in early spring.',
    },
    {
      id: 'mostly_clay',
      label: 'Mostly Clay',
      hint: 'High nutrient retention, holds moisture, slower springtime warm-up.',
    },
    {
      id: 'loamy',
      label: 'Loamy',
      hint: 'Rich & crumbly, balanced water holding, optimal for multi-rotations.',
    },
    {
      id: 'not_sure',
      label: 'Not Sure',
      hint: 'We will treat it as unknown and flag it as missing information.',
    },
  ],
  equipment: [
    { id: 'standard_tractor', label: 'Standard Tractor' },
    { id: 'seed_drill_planter', label: 'Seed Drill / Planter' },
    { id: 'no_till_drill', label: 'No-Till Drill' },
    { id: 'combine_harvester', label: 'Combine Harvester' },
    { id: 'drip_pivot_irrigation', label: 'Drip / Pivot Irrigation' },
    { id: 'hand_tiller_tools', label: 'Hand / Tiller Tools' },
  ],
  seasonsPerYear: [
    {
      id: 1,
      label: '1 Season / Year',
      hint: 'One crop per year, with the other season left without a crop.',
    },
    {
      id: 2,
      label: '2 Seasons / Year',
      hint: 'A winter crop followed by a summer crop.',
      recommended: true,
    },
  ],
  priority: [
    {
      id: 'save_water',
      label: 'Save Water',
      profileLabel: 'Save Water',
      hint: 'Maximize soil moisture retention and drought resistance.',
    },
    {
      id: 'improve_soil',
      label: 'Improve Soil',
      profileLabel: 'Improve Soil',
      hint: 'Boost organic biomass, root biology, and microbial life.',
    },
    {
      id: 'protect_land',
      label: 'Protect Land',
      profileLabel: 'Protect My Land',
      hint: 'Prevent wind and water erosion, build canopy cover.',
    },
    {
      id: 'manage_costs',
      label: 'Manage Costs',
      profileLabel: 'Reduce Costs',
      hint: 'Lower synthetic fertilizer, seed expense, and fuel trips.',
    },
    {
      id: 'earn_more',
      label: 'Earn More',
      profileLabel: 'Increase Earnings',
      hint: 'Target premium food grades and specialty grain markets.',
    },
  ],
  // Only the two seasons of the Rotation Lab (C3). The old three-season list (slots) is gone.
  seasons: [
    { id: 'winter', label: 'Winter', order: 1 },
    { id: 'summer', label: 'Summer', order: 2 },
  ],
  areaUnit: ['acres', 'hectares'],
  limits: { maxPriorities: 3 },
});