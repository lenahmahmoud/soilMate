import path from 'node:path';
import { initLayerData, resetLayerData } from '../../src/data/loadLayerData.js';
import { getCenterView, getMapLayer, listLayers, searchCenters } from '../../src/services/explorerService.js';

const SRC = path.resolve('src/data/layers');

beforeAll(() => initLayerData(SRC));
afterAll(() => resetLayerData());

describe('searchCenters', () => {
  test('empty q returns all 3 centers with governorate, bbox and mapCenter', () => {
    const r = searchCenters('');
    expect(r.centers.map((c) => c.id)).toEqual(['desouk', 'sidi_salem', 'baltim']);
    expect(r.centers[0]).toEqual({
      id: 'desouk', name: 'Desouk', nameAr: 'دسوق', governorate: 'Kafr El-Sheikh',
      bbox: [30.55, 31.05, 30.75, 31.25], mapCenter: { lat: 31.15, lon: 30.65 },
    });
    expect(r.coverageNote).toBe('We currently cover Desouk, Sidi Salem and Baltim.');
  });

  test('matches name case-insensitively', () => {
    expect(searchCenters('DES').centers.map((c) => c.id)).toEqual(['desouk']);
    expect(searchCenters('  sidi ').centers.map((c) => c.id)).toEqual(['sidi_salem']);
  });

  test('matches Arabic name and governorate', () => {
    expect(searchCenters('دسوق').centers.map((c) => c.id)).toEqual(['desouk']);
    expect(searchCenters('kafr').centers).toHaveLength(3);
  });

  test('no match returns an empty list plus the coverage note', () => {
    const r = searchCenters('cairo');
    expect(r.centers).toEqual([]);
    expect(r.coverageNote).toMatch(/Desouk, Sidi Salem and Baltim/);
  });

  test('non-string input does not crash', () => {
    expect(searchCenters(undefined).centers).toHaveLength(3);
  });
});

describe('getCenterView', () => {
  test('unknown center returns null', () => {
    expect(getCenterView('cairo')).toBeNull();
  });
});

describe('listLayers', () => {
  test('5 layers in order; only erosion_risk is unavailable', () => {
    const layers = listLayers();
    expect(layers.map((l) => l.id)).toEqual(['overview', 'soil_moisture', 'crop_health', 'heat_stress', 'erosion_risk']);
    expect(layers.map((l) => l.order)).toEqual([1, 2, 3, 4, 5]);
    expect(layers.filter((l) => !l.available).map((l) => l.id)).toEqual(['erosion_risk']);
    expect(layers[4].unavailableReason).toBe('Not available yet');
    expect(layers[0].unavailableReason).toBeUndefined();
  });
});

describe('getMapLayer', () => {
  test('crop_health: matches the contract example for Desouk', () => {
    const { kind, body } = getMapLayer('crop_health');
    expect(kind).toBe('ok');
    expect(body.dataThrough).toBe('2025-06');
    expect(body.legend.stops[0]).toEqual([0.2, '#C4553B']);
    expect(body.legend.stops).toHaveLength(4);
    expect(body.legend.items.map((i) => i.id)).toEqual(['low', 'mid', 'good']);
    const d = body.centers.find((c) => c.centerId === 'desouk');
    expect(d).toMatchObject({
      value: 0.56, valueLabel: '0.56', levelId: 'mid', levelLabel: 'Moderate green', face: 'neutral',
    });
    expect(d.fillHex.toLowerCase()).toBe('#9eb555');
    expect(body.centers.find((c) => c.centerId === 'sidi_salem').face).toBe('happy');
  });

  test('soil_moisture: needle, state, constant fill and model fields', () => {
    const { body } = getMapLayer('soil_moisture');
    expect(body.dataThrough).toBe('2025-06');
    const d = body.centers.find((c) => c.centerId === 'desouk');
    expect(d).toMatchObject({
      value: 9, levelId: 'dry', levelLabel: 'Drier than usual', fillHex: '#D9B26F', modelState: 'wet', modelNeedle: 91,
    });
    expect(body.centers.find((c) => c.centerId === 'baltim')).toMatchObject({ levelId: 'normal', fillHex: '#A8D5A2' });
  });

  test('heat_stress: hot days per year, no fill, no level', () => {
    const { body } = getMapLayer('heat_stress');
    expect(body.dataThrough).toBe('2025-12');
    const d = body.centers.find((c) => c.centerId === 'desouk');
    expect(d).toMatchObject({ value: 119.5, fillHex: null, levelId: null, levelLabel: null });
    expect(body.legend.unit).toMatch(/35/);
  });

  test('overview: risk score, level and color from the atlas', () => {
    const { body } = getMapLayer('overview');
    const d = body.centers.find((c) => c.centerId === 'desouk');
    expect(d).toMatchObject({ value: 1.75, levelLabel: 'Medium', levelId: 'medium', fillHex: '#d9a23b' });
    expect(body.legend.items).toHaveLength(3);
  });

  test('every layer lists the 3 centers, each with a bbox', () => {
    for (const id of ['overview', 'soil_moisture', 'crop_health', 'heat_stress']) {
      const { body } = getMapLayer(id);
      expect(body.layerId).toBe(id);
      expect(body.centers.map((c) => c.centerId)).toEqual(['desouk', 'sidi_salem', 'baltim']);
      for (const c of body.centers) expect(c.bbox).toHaveLength(4);
    }
  });

  test('erosion_risk is unavailable; unknown ids are unknown', () => {
    expect(getMapLayer('erosion_risk')).toEqual({ kind: 'unavailable', reason: 'Not available yet' });
    expect(getMapLayer('nope')).toEqual({ kind: 'unknown' });
    expect(getMapLayer('__proto__')).toEqual({ kind: 'unknown' });
  });
});