import { buildPlans } from '../../src/services/scoring/mockScoringClient.js';
import { plansResultSchema } from '../../src/services/scoring/scoringSchemas.js';

const crop = (id, name, roleTag, slots, family, isLegume, waterNeed, groundCover, costLevel, equipment, typicalDays) => ({
  id, name, roleTag, slots, family, isLegume, waterNeed, groundCover, costLevel, equipment, typicalDays,
});
const ALL = ['standard_tractor', 'seed_drill_planter', 'combine_harvester'];
const CATALOG = [
  crop('winter-rye', 'Winter Rye', 'Cover Crop', ['fall_winter'], 'grass', false, 'low', 'high', 'low', ['seed_drill_planter'], 150),
  crop('crimson-clover', 'Crimson Clover', 'Nitrogen Fixer', ['spring'], 'legume', true, 'low', 'high', 'low', ['seed_drill_planter'], 90),
  crop('field-corn', 'Field Corn', 'Main Cash Crop', ['spring', 'summer_fall'], 'grass', false, 'high', 'medium', 'high', ALL, 120),
  crop('soybeans', 'Soybeans', 'Legume Grain', ['spring', 'summer_fall'], 'legume', true, 'medium', 'medium', 'medium', ALL, 110),
  crop('fallow', 'Fallow', 'Bare Ground', ['fall_winter'], 'none', false, 'low', 'low', 'low', [], 60),
  crop('daikon', 'Daikon', 'Loosens Deep Soil', ['fall_winter'], 'brassica', false, 'low', 'high', 'low', ['seed_drill_planter'], 70),
  crop('field-peas', 'Field Peas', 'Low-Water Crop', ['spring'], 'legume', true, 'low', 'medium', 'low', ['seed_drill_planter', 'combine_harvester'], 90),
  crop('grain-sorghum', 'Grain Sorghum', 'Drought-Hardy', ['summer_fall'], 'grass', false, 'low', 'medium', 'low', ALL, 110),
];
const byId = (id) => CATALOG.find((c) => c.id === id);

const farm = {
  waterSource: 'mixed',
  waterAvailability: 'sometimes_limited',
  soilType: 'loamy',
  equipment: ALL,
  seasonsPerYear: 2,
  priorities: ['save_water'],
  landArea: null,
  currentCrops: [byId('field-corn'), byId('soybeans')],
};

const ORDER = ['water', 'soil', 'erosion', 'practicality', 'economy'];
const values = (plan) => ORDER.map((id) => plan.metrics[id].value);
const ids = (plan) => plan.sequence.map((s) => s.cropId);
const run = (over = {}) => buildPlans({ farm, labSequence: null, candidateCrops: CATALOG, ...over });
const plan = (result, key) => result.plans.find((p) => p.planKey === key);

describe('mock plans (guide section 11)', () => {
  test('returns 3 plans in order, placeholder, and passes the plans schema', () => {
    const r = run();
    expect(r.status).toBe('placeholder');
    expect(r.modelVersion).toBe('mock-0.1');
    expect(r.plans.map((p) => p.planKey)).toEqual(['keep_routine', 'improve_soil', 'save_water']);
    expect(() => plansResultSchema.parse(r)).not.toThrow();
  });

  test('keep_routine uses the first allowed current crop per slot, else fallow', () => {
    const p = plan(run(), 'keep_routine');
    expect(ids(p)).toEqual(['fallow', 'field-corn', 'field-corn']);
    expect(p.sequence.map((s) => s.roleTag)).toEqual(['Bare Ground', 'Main Cash Crop', 'Main Cash Crop']);
    expect(values(p)).toEqual([56, 50, 55, 100, 50]);
    expect(p.title).toBe('Keep My Current Routine');
    expect(p.badge).toEqual({ label: 'Baseline Example', tone: 'neutral' });
  });

  test('improve_soil defaults to rye, clover, corn', () => {
    const p = plan(run(), 'improve_soil');
    expect(ids(p)).toEqual(['winter-rye', 'crimson-clover', 'field-corn']);
    expect(values(p)).toEqual([72, 95, 79, 100, 68]);
    expect(p.badge).toEqual({ label: 'Soil Builder', tone: 'positive' });
  });

  test('a Lab sequence replaces improve_soil only', () => {
    const labSequence = [
      { slot: 'fall_winter', crop: byId('winter-rye') },
      { slot: 'spring', crop: byId('crimson-clover') },
      { slot: 'summer_fall', crop: byId('soybeans') },
    ];
    const r = run({ labSequence });
    expect(ids(plan(r, 'improve_soil'))).toEqual(['winter-rye', 'crimson-clover', 'soybeans']);
    expect(ids(plan(r, 'save_water'))).toEqual(['daikon', 'field-peas', 'grain-sorghum']);
    expect(ids(plan(r, 'keep_routine'))).toEqual(['fallow', 'field-corn', 'field-corn']);
  });

  test('save_water is daikon, field peas, grain sorghum', () => {
    const p = plan(run(), 'save_water');
    expect(ids(p)).toEqual(['daikon', 'field-peas', 'grain-sorghum']);
    expect(values(p)).toEqual([88, 100, 71, 100, 70]);
    expect(p.metrics.soil.note).toBe('Field Peas adds natural nitrogen before Grain Sorghum.');
    expect(p.badge.tone).toBe('positive');
  });

  test('no current crops gives fallow in every slot', () => {
    const p = plan(run({ farm: { ...farm, currentCrops: [] } }), 'keep_routine');
    expect(ids(p)).toEqual(['fallow', 'fallow', 'fallow']);
  });

  test('each plan has note = metric text, sample evidence, gaps, risks and low confidence', () => {
    for (const p of run().plans) {
      expect(p.evidence).toEqual(['Sample evidence: replace with real data when the scoring service is live.']);
      expect(p.infoGaps).toContain('No local market prices available.');
      expect(p.risksToReview).toEqual(['Review irrigation and planting dates with a local agricultural officer.']);
      expect(p.dataConfidence.level).toBe('low');
      expect(p.seasonDetails).toHaveLength(3);
      for (const id of ORDER) expect(p.metrics[id].note.length).toBeGreaterThan(0);
    }
  });

  test('is deterministic', () => {
    expect(run()).toEqual(run());
  });

  test('a catalog missing a needed crop fails loudly', () => {
    expect(() => run({ candidateCrops: CATALOG.filter((c) => c.id !== 'daikon') })).toThrow(/daikon/);
  });
});