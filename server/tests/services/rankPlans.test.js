import { rankPlans, metricWeights } from '../../src/services/scoring/rankPlans.js';

const plan = (water, soil, erosion, practicality, economy) => ({
  metrics: {
    water: { value: water },
    soil: { value: soil },
    erosion: { value: erosion },
    practicality: { value: practicality },
    economy: { value: economy },
  },
});

const KEEP = plan(56, 50, 55, 100, 50);
const IMPROVE = plan(72, 95, 79, 100, 68);
const SAVE = plan(88, 100, 71, 100, 70);
const field = (results, name) => results.map((r) => r[name]);

describe('metricWeights', () => {
  test('every metric starts at 1', () => {
    expect(metricWeights([])).toEqual({ water: 1, soil: 1, erosion: 1, practicality: 1, economy: 1 });
  });

  test('each priority adds 2 to its metric', () => {
    expect(metricWeights(['save_water', 'improve_soil'])).toEqual({
      water: 3, soil: 3, erosion: 1, practicality: 1, economy: 1,
    });
    expect(metricWeights(['protect_land']).erosion).toBe(3);
  });

  test('manage_costs and earn_more both feed economy', () => {
    expect(metricWeights(['manage_costs', 'earn_more']).economy).toBe(5);
  });

  test('an unknown priority is ignored', () => {
    expect(metricWeights(['banana'])).toEqual(metricWeights([]));
  });
});

describe('rankPlans', () => {
  test('weighted average, rank and recommendation', () => {
    const r = rankPlans([KEEP, IMPROVE, SAVE], ['save_water', 'improve_soil']);
    expect(field(r, 'matchScore')).toEqual([58, 83, 89]);
    expect(field(r, 'rank')).toEqual([3, 2, 1]);
    expect(field(r, 'recommended')).toEqual([false, false, true]);
    expect(field(r, 'recommendedLabel')).toEqual([null, null, 'Recommended for Water Goals']);
  });

  test('the label comes from the FIRST selected priority', () => {
    const r = rankPlans([KEEP, IMPROVE, SAVE], ['improve_soil', 'save_water']);
    expect(field(r, 'recommendedLabel')).toEqual([null, null, 'Recommended for Soil Goals']);
  });

  test('without priorities it is a plain average and there is no label', () => {
    const r = rankPlans([KEEP, IMPROVE, SAVE], []);
    expect(field(r, 'matchScore')).toEqual([62, 83, 86]);
    expect(field(r, 'recommendedLabel')).toEqual([null, null, null]);
    expect(field(r, 'rank')).toEqual([3, 2, 1]);
  });

  test('a tie goes to the lower plan number', () => {
    const r = rankPlans([plan(50, 50, 50, 50, 50), plan(80, 80, 80, 80, 80), plan(80, 80, 80, 80, 80)], ['save_water']);
    expect(field(r, 'rank')).toEqual([3, 1, 2]);
    expect(field(r, 'recommended')).toEqual([false, true, false]);
  });

  test('plans that tie after rounding are ranked by plan number', () => {
    const r = rankPlans([plan(58, 50, 55, 70, 50), plan(74, 95, 79, 70, 68), plan(90, 100, 71, 70, 70)], ['protect_land']);
    expect(field(r, 'matchScore')).toEqual([56, 78, 78]);
    expect(field(r, 'rank')).toEqual([3, 1, 2]);
    expect(r[1].recommendedLabel).toBe('Recommended for Land Protection');
  });

  test('does not change its input', () => {
    const plans = [KEEP, IMPROVE, SAVE];
    const before = JSON.stringify(plans);
    rankPlans(plans, ['save_water']);
    expect(JSON.stringify(plans)).toBe(before);
  });
});