// Crop catalog (data, not code). The agronomy owner can swap this list by editing this file only,
// then running: npm run seed:crops
// NOTE [A17]: these are US crops copied from the mockup. The study area is the Nile Delta.
// Every attribute and calendar label below is a PLACEHOLDER until the agronomy owner reviews it.

const SEED_EQ = 'seed_drill_planter';
const TRACTOR = 'standard_tractor';
const COMBINE = 'combine_harvester';

const crop = ({ imageAlt, ...c }) => ({
  subtitle: '',
  benefitTag: null,
  // defaultForSlot: null,
  status: 'placeholder',
  ...c,
  // files: public/crops/<id>.webp and public/crops/thumb/<id>.webp
  image: { file: `${c.id}.webp`, thumbFile: `${c.id}.webp`, alt: imageAlt },
});

export const CROPS = [
  crop({
    id: 'winter-rye', name: 'Winter Rye', category: 'cover_crop', roleTag: 'Cover Crop',
    description: 'Protects topsoil & holds moisture',
    slots: ['fall_winter'], selectableAsCurrent: false,
    imageAlt: 'Green winter rye growing in a field',
    calendar: { plantingLabel: 'Late Sep - Oct', harvestLabel: 'Apr - May' },
    attributes: { family: 'grass', isLegume: false, waterNeed: 'low', groundCover: 'high', costLevel: 'low', equipment: [SEED_EQ], typicalDays: 150 },
  }),
  crop({
    id: 'crimson-clover', name: 'Crimson Clover', category: 'cover_crop', roleTag: 'Nitrogen Fixer',
    description: 'Adds natural nitrogen to the soil',
    slots: ['spring'], selectableAsCurrent: false,
    imageAlt: 'Crimson clover with red flowers',
    calendar: { plantingLabel: 'Sep - Oct', harvestLabel: 'Apr - May' },
    attributes: { family: 'legume', isLegume: true, waterNeed: 'low', groundCover: 'high', costLevel: 'low', equipment: [SEED_EQ], typicalDays: 90 },
  }),
  crop({
    id: 'field-corn', name: 'Field Corn', category: 'cash_crop', roleTag: 'Main Cash Crop',
    description: 'Main cash crop harvest',
    slots: ['spring', 'summer_fall'], selectableAsCurrent: true, 
    imageAlt: 'Rows of field corn ready for harvest',
    calendar: { plantingLabel: 'Mar - May', harvestLabel: 'Aug - Sep' },
    attributes: { family: 'grass', isLegume: false, waterNeed: 'high', groundCover: 'medium', costLevel: 'high', equipment: [TRACTOR, SEED_EQ, COMBINE], typicalDays: 120 },
  }),
  crop({
    id: 'soybeans', name: 'Soybeans', category: 'legume', roleTag: 'Legume Grain',
    description: 'Legume grain',
    slots: ['spring', 'summer_fall'], selectableAsCurrent: true,
    imageAlt: 'Soybean plants with green pods',
    calendar: { plantingLabel: 'Apr - Jun', harvestLabel: 'Sep - Oct' },
    attributes: { family: 'legume', isLegume: true, waterNeed: 'medium', groundCover: 'medium', costLevel: 'medium', equipment: [TRACTOR, SEED_EQ, COMBINE], typicalDays: 110 },
  }),
  crop({
    id: 'winter-wheat', name: 'Winter Wheat', category: 'cash_crop', roleTag: 'Cash Crop',
    description: 'Cool-season grain crop',
    slots: ['fall_winter'], selectableAsCurrent: true,
    imageAlt: 'Golden winter wheat in a field',
    calendar: { plantingLabel: 'Oct - Nov', harvestLabel: 'May - Jun' },
    attributes: { family: 'grass', isLegume: false, waterNeed: 'medium', groundCover: 'high', costLevel: 'medium', equipment: [TRACTOR, SEED_EQ, COMBINE], typicalDays: 180 },
  }),
  crop({
    id: 'alfalfa-hay', name: 'Alfalfa / Hay', category: 'forage', roleTag: 'Forage Legume',
    description: 'Perennial forage that adds nitrogen',
    slots: ['fall_winter', 'spring'], selectableAsCurrent: true,
    imageAlt: 'Green alfalfa field',
    calendar: { plantingLabel: 'Sep - Oct', harvestLabel: 'Several cuts a year' },
    attributes: { family: 'legume', isLegume: true, waterNeed: 'high', groundCover: 'high', costLevel: 'medium', equipment: [TRACTOR, SEED_EQ], typicalDays: 120 },
  }),
  crop({
    id: 'grain-sorghum', name: 'Grain Sorghum', category: 'cash_crop', roleTag: 'Drought-Hardy',
    description: 'Drought-hardy grain',
    slots: ['summer_fall'], selectableAsCurrent: true,
    imageAlt: 'Grain sorghum heads in a field',
    calendar: { plantingLabel: 'May - Jun', harvestLabel: 'Sep - Oct' },
    attributes: { family: 'grass', isLegume: false, waterNeed: 'low', groundCover: 'medium', costLevel: 'low', equipment: [TRACTOR, SEED_EQ, COMBINE], typicalDays: 110 },
  }),
  crop({
    id: 'cotton', name: 'Cotton', category: 'cash_crop', roleTag: 'Fiber Crop',
    description: 'Warm-season fiber crop',
    slots: ['spring', 'summer_fall'], selectableAsCurrent: true,
    imageAlt: 'Cotton plants with open white bolls',
    calendar: { plantingLabel: 'Apr - May', harvestLabel: 'Sep - Nov' },
    attributes: { family: 'mallow', isLegume: false, waterNeed: 'high', groundCover: 'low', costLevel: 'high', equipment: [TRACTOR, SEED_EQ], typicalDays: 160 },
  }),
  crop({
    id: 'daikon', name: 'Daikon', category: 'cover_crop', roleTag: 'Loosens Deep Soil',
    description: 'Loosens deep soil',
    slots: ['fall_winter'], selectableAsCurrent: false,
    imageAlt: 'Daikon radish growing in the soil',
    calendar: { plantingLabel: 'Sep - Oct', harvestLabel: 'Nov - Dec' },
    attributes: { family: 'brassica', isLegume: false, waterNeed: 'low', groundCover: 'high', costLevel: 'low', equipment: [SEED_EQ], typicalDays: 70 },
  }),
  crop({
    id: 'field-peas', name: 'Field Peas', category: 'legume', roleTag: 'Low-Water Crop',
    description: 'Low-water crop',
    slots: ['spring'], selectableAsCurrent: false,
    imageAlt: 'Field pea plants with pods',
    calendar: { plantingLabel: 'Feb - Mar', harvestLabel: 'May - Jun' },
    attributes: { family: 'legume', isLegume: true, waterNeed: 'low', groundCover: 'medium', costLevel: 'low', equipment: [SEED_EQ, COMBINE], typicalDays: 90 },
  }),
  crop({
    id: 'fallow', name: 'Fallow', category: 'fallow', roleTag: 'Bare Ground',
    description: 'Bare ground between crops',
    slots: ['fall_winter'], selectableAsCurrent: false,
    imageAlt: 'Bare field resting between crops',
    calendar: { plantingLabel: null, harvestLabel: null },
    attributes: { family: 'none', isLegume: false, waterNeed: 'low', groundCover: 'low', costLevel: 'low', equipment: [], typicalDays: 60 },
  }),
];