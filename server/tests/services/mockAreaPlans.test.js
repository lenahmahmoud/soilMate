import { mockScoringClient, scoreSequence, buildPlans } from '../../src/services/scoring/mockScoringClient.js';
import { AREA_PLAN_CROPS, AREA_PLAN_KEYS } from '../../src/services/scoring/mockAreaPlans.js';
import { METRIC_IDS } from '../../src/constants/metrics.js';
import { SLOTS } from '../../src/constants/soilmateEnums.js';
const SEED = (id, name, roleTag, slots, family, isLegume, waterNeed, groundCover, costLevel, equipment) => ({
  id, name, roleTag, slots, family, isLegume, waterNeed, groundCover, costLevel, equipment,
});
const ALL_EQ = ['standard_tractor', 'seed_drill_planter', 'combine_harvester'];
const CATALOG = [
  SEED('winter-rye', 'Winter Rye', 'Cover Crop', ['fall_winter'], 'grass', false, 'low', 'high', 'low', ['seed_drill_planter']),
  SEED('crimson-clover', 'Crimson Clover', 'Nitrogen Fixer', ['spring'], 'legume', true, 'low', 'high', 'low', ['seed_drill_planter']),
  SEED('field-corn', 'Field Corn', 'Main Cash Crop', ['spring', 'summer_fall'], 'grass', false, 'high', 'medium', 'high', ALL_EQ),
  SEED('soybeans', 'Soybeans', 'Legume Grain', ['spring', 'summer_fall'], 'legume', true, 'medium', 'medium', 'medium', ALL_EQ),
  SEED('winter-wheat', 'Winter Wheat', 'Cash Crop', ['fall_winter'], 'grass', false, 'medium', 'high', 'medium', ALL_EQ),
  SEED('alfalfa-hay', 'Alfalfa / Hay', 'Forage Legume', ['fall_winter', 'spring'], 'legume', true, 'high', 'high', 'medium', ['standard_tractor', 'seed_drill_planter']),
  SEED('grain-sorghum', 'Grain Sorghum', 'Drought-Hardy', ['summer_fall'], 'grass', false, 'low', 'medium', 'low', ALL_EQ),
  SEED('daikon', 'Daikon', 'Loosens Deep Soil', ['fall_winter'], 'brassica', false, 'low', 'high', 'low', ['seed_drill_planter']),
  SEED('field-peas', 'Field Peas', 'Low-Water Crop', ['spring'], 'legume', true, 'low', 'medium', 'low', ['seed_drill_planter', 'combine_harvester']),
  SEED('fallow', 'Fallow', 'Bare Ground', ['fall_winter'], 'none', false, 'low', 'low', 'low', []),
];
const byId = (id) => CATALOG.find((c) => c.id === id);
const FARM = {
  centerId: 'desouk', waterSource: 'mixed', waterAvailability: 'sometimes_limited', soilType: 'loamy',
  equipment: ALL_EQ, seasonsPerYear: 2, priorities: ['save_water'],
};
const seq = (...ids) => SLOTS.map((slot, i) => ({ slot, crop: byId(ids[i]) }));

describe('score plan block', () => {
  const result = scoreSequence({ farm: FARM, sequence: seq('winter-rye', 'crimson-clover', 'field-corn') });

  it('has the five plan fields', () => {
    expect(Object.keys(result.plan).sort()).toEqual(['evidence', 'infoGaps', 'mainBenefit', 'risksToReview', 'watchOut']);
    expect(result.plan.evidence).toEqual(['Sample evidence: replace with real data when the scoring service is live.']);
    expect(result.plan.risksToReview).toEqual(['Review irrigation and planting dates with a local agricultural officer.']);
    expect(result.plan.infoGaps).toEqual(result.gaps);
  });

  it('mainBenefit is the text of the highest metric and watchOut of the lowest', () => {
    const values = METRIC_IDS.map((id) => result.metrics[id].value);
    const best = METRIC_IDS[values.indexOf(Math.max(...values))];
    const worst = METRIC_IDS[values.indexOf(Math.min(...values))];
    expect(result.plan.mainBenefit).toBe(result.metrics[best].text);
    expect(result.plan.watchOut).toBe(result.metrics[worst].text);
  });

  it('watchOut is always one of the five metric texts', () => {
    expect(METRIC_IDS.map((id) => result.metrics[id].text)).toContain(result.plan.watchOut);
  });

  it('is deterministic', () => {
    const again = scoreSequence({ farm: FARM, sequence: seq('winter-rye', 'crimson-clover', 'field-corn') });
    expect(again).toEqual(result);
  });

  it('mockScoringClient.score returns it', async () => {
    const viaClient = await mockScoringClient.score({ farm: FARM, sequence: seq('winter-rye', 'crimson-clover', 'field-corn') });
    expect(viaClient.plan).toEqual(result.plan);
  });
});

describe('mock area plans', () => {
  it.each(['desouk', 'sidi_salem', 'baltim'])('returns exactly 2 plans for %s', async (centerId) => {
    const res = await mockScoringClient.plans({ centerId, farm: { ...FARM, centerId }, candidateCrops: CATALOG });
    expect(res.status).toBe('placeholder');
    expect(res.plans.map((p) => p.planKey)).toEqual(['area_plan_a', 'area_plan_b']);
    for (const plan of res.plans) {
      expect(plan.sequence.map((s) => s.slot)).toEqual(SLOTS);
      expect(Object.keys(plan.metrics)).toEqual(METRIC_IDS);
      expect(plan.seasonDetails).toHaveLength(3);
      expect(plan.evidence.length).toBeGreaterThan(0);
      expect(plan.infoGaps.length).toBeGreaterThan(0);
      expect(plan.risksToReview.length).toBeGreaterThan(0);
      expect(plan.title).toBeTruthy();
      expect(plan.badge.label).toBeTruthy();
    }
  });

  it('never returns the old plan keys', async () => {
    const res = await mockScoringClient.plans({ centerId: 'desouk', farm: FARM, candidateCrops: CATALOG });
    const keys = res.plans.map((p) => p.planKey);
    expect(keys).not.toContain('keep_routine');
    expect(keys).not.toContain('improve_soil');
    expect(keys).not.toContain('save_water');
  });

  it('every crop is allowed in its slot and exists in the catalog', () => {
    for (const [area, plans] of Object.entries(AREA_PLAN_CROPS)) {
      for (const key of AREA_PLAN_KEYS) {
        plans[key].forEach((id, i) => {
          const crop = byId(id);
          expect({ area, key, id, found: !!crop }).toEqual({ area, key, id, found: true });
          expect(crop.slots).toContain(SLOTS[i]);
        });
      }
    }
  });

  it('the plans differ from area to area and between a and b', async () => {
    const seqs = {};
    for (const centerId of Object.keys(AREA_PLAN_CROPS)) {
      const res = await mockScoringClient.plans({ centerId, farm: FARM, candidateCrops: CATALOG });
      for (const p of res.plans) seqs[`${centerId}/${p.planKey}`] = p.sequence.map((s) => s.cropId).join(',');
    }
    expect(new Set(Object.values(seqs)).size).toBe(6);
  });

  it('ignores labSequence and currentCrops', () => {
    const a = buildPlans({ centerId: 'baltim', farm: FARM, candidateCrops: CATALOG });
    const b = buildPlans({
      centerId: 'baltim',
      farm: { ...FARM, currentCrops: [byId('cotton')] },
      labSequence: seq('winter-rye', 'crimson-clover', 'field-corn'),
      candidateCrops: CATALOG,
    });
    expect(b).toEqual(a);
  });

  it('scores the plans for this farm (answers change the scores)', () => {
    const sandy = buildPlans({ centerId: 'desouk', farm: { ...FARM, soilType: 'mostly_sandy', waterAvailability: 'often_limited' }, candidateCrops: CATALOG });
    const loamy = buildPlans({ centerId: 'desouk', farm: FARM, candidateCrops: CATALOG });
    expect(sandy.plans[0].metrics.water.value).toBeLessThan(loamy.plans[0].metrics.water.value);
  });

  it('plan metric note equals the same metric text from /v1/score', () => {
    const res = buildPlans({ centerId: 'desouk', farm: FARM, candidateCrops: CATALOG });
    const scored = scoreSequence({ farm: FARM, sequence: seq('winter-rye', 'crimson-clover', 'field-corn') });
    for (const id of METRIC_IDS) {
      expect(res.plans[0].metrics[id].note).toBe(scored.metrics[id].text);
      expect(res.plans[0].metrics[id].value).toBe(scored.metrics[id].value);
    }
  });

  it('throws for an unknown area and for a crop missing from the catalog', () => {
    expect(() => buildPlans({ centerId: 'cairo', farm: FARM, candidateCrops: CATALOG })).toThrow(/no data for the area/);
    expect(() => buildPlans({ centerId: 'desouk', farm: FARM, candidateCrops: CATALOG.filter((c) => c.id !== 'daikon') })).toThrow(/daikon/);
  });

  it('uses farm.centerId when centerId is not passed', () => {
    const res = buildPlans({ farm: { ...FARM, centerId: 'sidi_salem' }, candidateCrops: CATALOG });
    expect(res.plans[0].sequence.map((s) => s.cropId)).toEqual(AREA_PLAN_CROPS.sidi_salem.area_plan_a);
  });
});