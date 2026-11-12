import { scoreSequence } from '../../src/services/scoring/mockScoringClient.js';
import { scoreResultSchema } from '../../src/services/scoring/scoringSchemas.js';

const crop = (id, name, family, isLegume, waterNeed, groundCover, costLevel, equipment, typicalDays) => ({
  id, name, family, isLegume, waterNeed, groundCover, costLevel, equipment, typicalDays,
});
const C = {
  rye: crop('winter-rye', 'Winter Rye', 'grass', false, 'low', 'high', 'low', ['seed_drill_planter'], 150),
  clover: crop('crimson-clover', 'Crimson Clover', 'legume', true, 'low', 'high', 'low', ['seed_drill_planter'], 90),
  corn: crop('field-corn', 'Field Corn', 'grass', false, 'high', 'medium', 'high', ['standard_tractor', 'seed_drill_planter', 'combine_harvester'], 120),
  wheat: crop('winter-wheat', 'Winter Wheat', 'grass', false, 'medium', 'high', 'medium', ['standard_tractor', 'seed_drill_planter', 'combine_harvester'], 180),
  sorghum: crop('grain-sorghum', 'Grain Sorghum', 'grass', false, 'low', 'medium', 'low', ['standard_tractor', 'seed_drill_planter', 'combine_harvester'], 110),
};
const seq = (...crops) => crops.map((c, i) => ({ slot: ['fall_winter', 'spring', 'summer_fall'][i], crop: c }));

const farm = {
  waterSource: 'mixed',
  waterAvailability: 'sometimes_limited',
  soilType: 'loamy',
  equipment: ['standard_tractor', 'seed_drill_planter', 'combine_harvester'],
  seasonsPerYear: 2,
  priorities: ['save_water'],
  landArea: null,
};

describe('mock scoring (guide section 11)', () => {
  test('rye, clover, corn gives the hand-computed values', () => {
    const r = scoreSequence({ farm, sequence: seq(C.rye, C.clover, C.corn) });
    const v = (id) => r.metrics[id].value;
    expect([v('water'), v('soil'), v('erosion'), v('practicality'), v('economy')]).toEqual([72, 95, 79, 100, 68]);
    expect(r.metrics.water.level).toBe('moderate');
    expect(r.metrics.soil.level).toBe('high');
    expect(r.metrics.water.reasons).toEqual(['corn_high_water', 'availability_sometimes_limited']);
    expect(r.metrics.soil.text).toBe('Crimson Clover adds natural nitrogen before Field Corn.');
    expect(r.status).toBe('placeholder');
    expect(r.modelVersion).toBe('mock-0.1');
  });

  test('is deterministic and matches the Python result shape', () => {
    const a = scoreSequence({ farm, sequence: seq(C.rye, C.clover, C.corn) });
    const b = scoreSequence({ farm, sequence: seq(C.rye, C.clover, C.corn) });
    expect(a).toEqual(b);
    expect(() => scoreResultSchema.parse(a)).not.toThrow();
  });

  test('same family back to back lowers soil and uses the family sentence', () => {
    const r = scoreSequence({ farm, sequence: seq(C.wheat, C.corn, C.sorghum) });
    expect(r.metrics.soil.value).toBe(50);
    expect(r.metrics.soil.text).toMatch(/same crop family/);
  });

  test('missing equipment lowers practicality and is listed', () => {
    const r = scoreSequence({ farm: { ...farm, equipment: [] }, sequence: seq(C.rye, C.clover, C.corn) });
    expect(r.metrics.practicality.value).toBe(70);
    expect(r.metrics.practicality.text).toMatch(/equipment you did not select/);
    expect(r.metrics.practicality.text).toMatch(/Combine Harvester/);
  });

  test('"not sure" soil adds a gap; market prices gap is always there', () => {
    const r = scoreSequence({ farm: { ...farm, soilType: 'not_sure' }, sequence: seq(C.rye, C.clover, C.corn) });
    expect(r.gaps.some((g) => /not sure/.test(g))).toBe(true);
    expect(r.gaps).toContain('No local market prices available.');
  });

  test('swapping corn for sorghum raises water', () => {
    const corn = scoreSequence({ farm, sequence: seq(C.rye, C.clover, C.corn) });
    const sorghum = scoreSequence({ farm, sequence: seq(C.rye, C.clover, C.sorghum) });
    expect(sorghum.metrics.water.value).toBeGreaterThan(corn.metrics.water.value);
  });

  test('all values are integers in 0..100 and there are 3 season details', () => {
    const r = scoreSequence({ farm, sequence: seq(C.wheat, C.corn, C.sorghum) });
    for (const m of Object.values(r.metrics)) {
      expect(Number.isInteger(m.value)).toBe(true);
      expect(m.value).toBeGreaterThanOrEqual(0);
      expect(m.value).toBeLessThanOrEqual(100);
    }
    expect(r.seasonDetails).toHaveLength(3);
  });
});