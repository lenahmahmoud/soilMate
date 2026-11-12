import { OPTIONS } from '../../constants/options.js';
import { levelOf } from '../../constants/levels.js';
import { AppError } from '../../utils/AppError.js';
import { SLOTS } from '../../constants/soilmateEnums.js';
import { METRIC_IDS } from '../../constants/metrics.js';
export const MOCK_MODEL_VERSION = 'mock-0.1';

const NUM = { low: 1, medium: 2, high: 3 };
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const sum = (list, fn) => list.reduce((total, x) => total + fn(x), 0);

const AVAILABILITY_ADJ = { often_limited: -12, sometimes_limited: -6, usually_enough: 0 };
const SOURCE_ADJ = { rain: -4, other: -2 }; // every other source: 0
const SOIL_ADJ = { mostly_sandy: -4, mostly_clay: 2, loamy: 4, not_sure: 0 };

const COVER_VALUE = { low: 25, medium: 60, high: 90 };
const WATER_VALUE = { low: 25, medium: 55, high: 85 };
const WATER_LABEL = {
  low: 'Low water demand',
  medium: 'Moderate water demand',
  high: 'Peak water demand',
};

const BASIS = {
  water: 'Based on crop water needs, water source and availability.',
  soil: 'Based on legumes and crop family variety.',
  erosion: 'Based on how much each crop covers the ground.',
  practicality: 'Based on your selected equipment.',
  economy: 'Based on input cost levels only. Local prices are not included.',
};

const nameOf = (crop) => crop.name ?? crop.id;
const equipmentLabel = (id) => OPTIONS.equipment.find((e) => e.id === id)?.label ?? id;

function metric(rawValue, text, basis, reasons = []) {
  const value = clamp(rawValue);
  return { value, level: levelOf(value), text, basis, reasons };
}

function scoreWater(farm, crops) {
  let v = 90 - sum(crops, (c) => (NUM[c.waterNeed] - 1) * 8);
  v += AVAILABILITY_ADJ[farm.waterAvailability] ?? 0;
  v += SOURCE_ADJ[farm.waterSource] ?? 0;
  v += SOIL_ADJ[farm.soilType] ?? 0;

  const thirsty = crops.find((c) => c.waterNeed === 'high');
  const reasons = [];
  if (thirsty) reasons.push('corn_high_water');
  if (farm.waterAvailability) reasons.push(`availability_${farm.waterAvailability}`);

  const text = thirsty
    ? `${nameOf(thirsty)} needs more water than this farm usually has in the dry season.`
    : 'The selected crops’ water needs look manageable for this farm.';
  return metric(v, text, BASIS.water, reasons);
}

function scoreSoil(crops) {
  let v = 60;
  if (crops.some((c) => c.isLegume)) v += 15;

  // a legume immediately before a non-legume (c1 -> c2 or c2 -> c3)
  const legumeBefore = [0, 1].find((i) => crops[i].isLegume && !crops[i + 1].isLegume);
  if (legumeBefore !== undefined) v += 10;

  const sameFamily = [0, 1].some((i) => crops[i].family === crops[i + 1].family);
  if (sameFamily) v -= 15;

  const families = new Set(crops.map((c) => c.family));
  v += Math.min(10, 5 * (families.size - 1));
  if (crops.some((c) => c.groundCover === 'high')) v += 5;

  let text = 'This sequence offers some variety, but no nitrogen-fixing crop.';
  if (legumeBefore !== undefined) {
    text = `${nameOf(crops[legumeBefore])} adds natural nitrogen before ${nameOf(crops[legumeBefore + 1])}.`;
  } else if (sameFamily) {
    text = 'Planting the same crop family back to back can wear down the soil.';
  }
  return metric(v, text, BASIS.soil);
}

function scoreErosion(crops) {
  const v = 15 + 8 * sum(crops, (c) => NUM[c.groundCover]);
  const covered = crops.find((c) => c.groundCover === 'high');

  let text = 'The crops give moderate ground cover through the year.';
  if (covered) {
    text = `${nameOf(covered)} keeps the ground covered, which helps protect the topsoil.`;
  } else if (crops.some((c) => c.groundCover === 'low')) {
    text = 'Some seasons leave the soil exposed to wind and rain.';
  }
  return metric(v, text, BASIS.erosion);
}

function scorePracticality(farm, crops) {
  const have = new Set(farm.equipment ?? []);
  const required = new Set(crops.flatMap((c) => c.equipment ?? []));
  const missing = [...required].filter((item) => !have.has(item));
  const v = Math.max(30, 100 - 10 * missing.length);

  const text = missing.length
    ? `You may need equipment you did not select: ${missing.map(equipmentLabel).join(', ')}.`
    : 'The crops fit the equipment you listed.';
  return metric(v, text, BASIS.practicality);
}

function scoreEconomy(crops) {
  let v = 70 - 5 * (sum(crops, (c) => NUM[c.costLevel]) - 3);
  const saves = [0, 1].find((i) => crops[i].isLegume && crops[i + 1].costLevel === 'high');
  if (saves !== undefined) v += 8;

  const text =
    saves !== undefined
      ? `A legume before ${nameOf(crops[saves + 1])} can reduce the amount of fertilizer you need to buy.`
      : 'Costs depend on local seed, fertilizer and market prices we do not have yet.';
  return metric(v, text, BASIS.economy);
}

// Pure function. farm = the scoring farm (contract section 11); sequence = [{ slot, crop }] in slot order.
export function scoreSequence({ farm, sequence }) {
  const crops = sequence.map((item) => item.crop);

  const gaps = [];
  if (farm.soilType === 'not_sure') gaps.push('Soil type was marked ‘not sure’.');
  gaps.push('No local market prices available.');

  return {
    status: 'placeholder',
    modelVersion: MOCK_MODEL_VERSION,
    metrics: {
      water: scoreWater(farm, crops),
      soil: scoreSoil(crops),
      erosion: scoreErosion(crops),
      practicality: scorePracticality(farm, crops),
      economy: scoreEconomy(crops),
    },
    seasonDetails: sequence.map(({ slot, crop }) => ({
      slot,
      cropId: crop.id,
      groundCover: {
        value: COVER_VALUE[crop.groundCover],
        label: `${nameOf(crop)} cover`,
        note: 'Estimated ground cover during this season.',
      },
      waterDemand: {
        value: WATER_VALUE[crop.waterNeed],
        label: WATER_LABEL[crop.waterNeed],
        note: 'Relative demand compared with the other crops.',
      },
    })),
    dataConfidence: {
      level: 'low',
      note: 'Sample scoring. Not yet based on real crop and land data.',
    },
    gaps,
    notices: ['Scores show how well this fits, not what your yield or profit will be.'],
  };
}

// ---------------- Mock /v1/plans (guide section 11) ----------------

const MANUAL_PLANS = {
  keep_routine: {
    badge: { label: 'Baseline Example', tone: 'neutral' },
    title: 'Keep My Current Routine',
    mainBenefit: 'Uses the equipment, seeds, and planting schedule you already have.',
    watchOut: 'May leave the ground bare between crops and need more bought fertilizer.',
  },
  improve_soil: {
    badge: { label: 'Soil Builder', tone: 'positive' },
    title: 'Improve My Soil',
    mainBenefit: 'A nitrogen-fixing crop adds natural plant food while a winter cover protects the soil.',
    watchOut: 'You will need to manage the cover crop before planting the next crop.',
  },
  save_water: {
    badge: { label: 'Drought & Cost Resilient', tone: 'positive' },
    title: 'Save Water & Balance Costs',
    mainBenefit: 'These crops need less water and deep roots help the soil hold moisture.',
    watchOut: 'Check local market prices and planting windows before choosing.',
  },
};

const DEFAULT_IMPROVE_SOIL = ['winter-rye', 'crimson-clover', 'field-corn'];
const SAVE_WATER_IDS = ['daikon', 'field-peas', 'grain-sorghum'];
const PLAN_EVIDENCE = 'Sample evidence: replace with real data when the scoring service is live.';
const PLAN_RISK = 'Review irrigation and planting dates with a local agricultural officer.';

// Pure function. candidateCrops must hold the whole catalog (it is also where slots, names and
// role tags come from). farm.currentCrops = crop objects in the order the farmer chose them.
export function buildPlans({ farm, labSequence, candidateCrops }) {
  const catalog = new Map(candidateCrops.map((c) => [c.id, c]));
  const full = (c) => catalog.get(c.id) ?? c;
  const need = (id) => {
    const crop = catalog.get(id);
    if (!crop) throw new AppError(500, 'INTERNAL', `Mock plans need the crop "${id}" in the catalog`);
    return crop;
  };

  // keep_routine: first current crop allowed in each slot, else fallow
  const current = (farm.currentCrops ?? []).map(full);
  const routine = SLOTS.map((slot) => ({
    slot,
    crop: current.find((c) => (c.slots ?? []).includes(slot)) ?? need('fallow'),
  }));

  // improve_soil: the Lab sequence if there is one, else the default
  const improve = labSequence?.length
    ? labSequence.map(({ slot, crop }) => ({ slot, crop: full(crop) }))
    : SLOTS.map((slot, i) => ({ slot, crop: need(DEFAULT_IMPROVE_SOIL[i]) }));

  const saveWater = SLOTS.map((slot, i) => ({ slot, crop: need(SAVE_WATER_IDS[i]) }));

  const sequences = { keep_routine: routine, improve_soil: improve, save_water: saveWater };

  const plans = Object.entries(sequences).map(([planKey, sequence]) => {
    const scored = scoreSequence({ farm, sequence }); // same function as /v1/score
    return {
      planKey,
      ...MANUAL_PLANS[planKey],
      sequence: sequence.map(({ slot, crop }) => ({ slot, cropId: crop.id, roleTag: crop.roleTag ?? null })),
      metrics: Object.fromEntries(
        METRIC_IDS.map((id) => {
          const m = scored.metrics[id];
          return [id, { value: m.value, level: m.level, note: m.text }]; // note = the metric text
        }),
      ),
      seasonDetails: scored.seasonDetails,
      evidence: [PLAN_EVIDENCE],
      infoGaps: scored.gaps,
      risksToReview: [PLAN_RISK],
      dataConfidence: scored.dataConfidence,
    };
  });

  return { status: 'placeholder', modelVersion: MOCK_MODEL_VERSION, plans };
}

export const mockScoringClient = {
  async score({ farm, sequence }) {
    return scoreSequence({ farm, sequence });
  },
  async plans({ farm, labSequence, candidateCrops }) {
    return buildPlans({ farm, labSequence, candidateCrops });
  },
};