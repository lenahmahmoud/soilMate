// Mock "fixed plans" of each area (placeholder rotations, not read from any data file).
// Crop ids are in slot order: fall_winter, spring, summer_fall. Every crop must be allowed in its slot.
// The real, area-specific plans will come from the Python service.

export const AREA_PLAN_KEYS = ['area_plan_a', 'area_plan_b'];

export const AREA_PLAN_TEXTS = {
  area_plan_a: {
    badge: { label: 'Soil Builder', tone: 'positive' },
    title: 'Build the Soil',
    mainBenefit: 'A nitrogen-fixing crop adds natural plant food while a cover crop protects the soil.',
    watchOut: 'You will need to manage the cover crop before planting the next crop.',
  },
  area_plan_b: {
    badge: { label: 'Drought & Cost Resilient', tone: 'positive' },
    title: 'Save Water & Balance Costs',
    mainBenefit: 'These crops need less water and deep roots help the soil hold moisture.',
    watchOut: 'Check local market prices and planting windows before choosing.',
  },
};

export const AREA_PLAN_CROPS = {
  desouk: {
    area_plan_a: ['winter-rye', 'crimson-clover', 'field-corn'],
    area_plan_b: ['daikon', 'field-peas', 'grain-sorghum'],
  },
  sidi_salem: {
    area_plan_a: ['winter-wheat', 'soybeans', 'grain-sorghum'],
    area_plan_b: ['alfalfa-hay', 'field-peas', 'field-corn'],
  },
  baltim: {
    area_plan_a: ['daikon', 'crimson-clover', 'grain-sorghum'],
    area_plan_b: ['winter-wheat', 'field-peas', 'soybeans'],
  },
};