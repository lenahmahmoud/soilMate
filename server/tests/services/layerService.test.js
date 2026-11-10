import path from 'node:path';
import { initLayerData, resetLayerData } from '../../src/data/loadLayerData.js';
import {
  getCropHealth, getGlossary, getHeatStress, getLandRisk, getOverview, getSoilMoisture,
} from '../../src/services/layerService.js';

const SRC = path.resolve('src/data/layers');
const CENTERS = ['desouk', 'sidi_salem', 'baltim'];

beforeAll(() => initLayerData(SRC));
afterAll(() => resetLayerData());

describe('getOverview', () => {
  test('Baltim: site, dataThrough and tiles come straight from the files', () => {
    const o = getOverview('baltim');
    expect(o.center).toMatchObject({
      id: 'baltim', name: 'Baltim', governorate: 'Kafr El-Sheikh',
      site: { lat: 31.5558, lon: 31.0892, elevationM: 17, slopeDeg: 2.15, coastDistanceKm: 4 },
    });
    expect(o.dataThrough).toEqual({ cropHealth: '2025-06', soilMoisture: '2025-06', heatWeather: '2025-12', heatSatellite: '2025-06' });
    expect(o.tiles.map((t) => t.id)).toEqual(['crop_greenness', 'green_months', 'soil_moisture', 'hot_days']);
    expect(o.tiles[0]).toMatchObject({ value: 0.52, display: '0.52', chip: { id: 'mid', label: 'Moderate green' } });
    expect(o.tiles[1]).toMatchObject({ value: 100, display: '100%' });
    expect(o.tiles[2]).toMatchObject({ value: 'normal', display: 'About usual' });
    expect(o.tiles[3]).toMatchObject({ value: 6.2, display: '6.2' });
  });

  test('Desouk matches the contract example', () => {
    const o = getOverview('desouk');
    expect(o.tiles[1]).toMatchObject({ value: 92, display: '92%' });
    expect(o.tiles[2]).toMatchObject({ value: 'dry', display: 'Drier than usual' });
    expect(o.tiles[3].value).toBe(119.5);
    expect(o.heat).toMatchObject({
      avgHighC: 29.7, avgLowC: 16.5, hottestDay: { date: '2024-06-14', tmaxC: 46.54 },
      heatDaysPerYear: 119.5, longestHotSpell: { days: 76, from: '2021-06-19' }, trendPerDecadeC: 1,
    });
    expect(o.soilMoisture.satellite).toEqual({ state: 'dry', label: 'Drier than usual', needle: 9 });
    expect(o.soilMoisture.model).toEqual({ state: 'wet', label: 'Wetter than usual', needle: 91 });
    expect(o.soilMoisture.rootZone.needle).toBe(82);
    expect(o.soilMoisture.dryMonthsLast12).toEqual({ satellite: 11, model: 9 });
    expect(o.center.site).toMatchObject({ elevationM: 11, slopeDeg: 2.17, coastDistanceKm: 51 });
  });

  test('lastMonths has 4 entries with short, ndvi and fillHex', () => {
    const o = getOverview('baltim');
    expect(o.lastMonths.map((m) => m.short)).toEqual(['Mar', 'Apr', 'May', 'Jun']);
    for (const m of o.lastMonths) expect(m.fillHex).toMatch(/^#[0-9a-f]{6}$/i);
  });

  test('land risk: score, level, color, 4 labelled indicators and the notice', () => {
    const r = getOverview('baltim').landRisk;
    expect(r).toMatchObject({ score: 1.75, scaleMin: 1, scaleMax: 3, level: 'Medium', levelHex: '#d9a23b' });
    expect(r.indicators.map((i) => i.label)).toEqual(['Vegetation', 'Soil moisture', 'Heat', 'Coast exposure (distance only)']);
    expect(r.indicators[3]).toMatchObject({ id: 'salinity', status: 'Alarming', score: 3 });
    expect(r.notice).toMatch(/Salinity is not measured/);
  });

  test('never contains invented fields (NPK, pH, yield, performance)', () => {
    const text = JSON.stringify(getOverview('desouk')).toLowerCase();
    for (const bad of ['npk', '"ph"', 'yield', 'performance', 'forecast']) expect(text.includes(bad)).toBe(false);
  });

  test('disclaimer and footer are present', () => {
    const o = getOverview('baltim');
    expect(o.disclaimer).toMatch(/does not replace the farmer/);
    expect(o.footer).toMatch(/This tool helps you see the picture/);
  });
});

describe('getCropHealth', () => {
  test('selected center + shared charts for all 3', () => {
    const r = getCropHealth('baltim');
    expect(r.center).toMatchObject({ id: 'baltim', chartKey: 'Baltim', latest: { ndvi: 0.5156 } });
    expect(r.center.insights).toHaveLength(6);
    expect(r.center.monthlySeries).toBeUndefined();
    expect(Object.keys(r.charts)).toEqual(['A', 'B', 'E']);
    expect(Object.keys(r.charts.A.series)).toHaveLength(3);
    expect(r.meta.thresholds).toEqual({ bare_below: 0.4, good_from: 0.6 });
    expect(r.dataThrough).toBe('2025-06');
  });

  test('keeps the raw NDVI value (no rounding in the detail endpoint)', () => {
    expect(getCropHealth('desouk').center.latest.ndvi).toBe(0.562);
  });

  test('includeMonthly adds the 123-month series', () => {
    expect(getCropHealth('sidi_salem', { includeMonthly: true }).center.monthlySeries).toHaveLength(123);
    expect(getCropHealth('sidi_salem').center.chartKey).toBe('Sidi_Salem');
  });
});

describe('getSoilMoisture', () => {
  test.each(CENTERS)('%s: only its own rows', (id) => {
    const r = getSoilMoisture(id);
    expect(r.calendar).toHaveLength(123);
    expect(r.typicalYear).toHaveLength(36);
    expect(r.yearsStrip).toHaveLength(11);
    expect(r.calendar.every((x) => x.center === id)).toBe(true);
    expect(r.typicalYear.every((x) => x.center === id)).toBe(true);
    expect(r.yearsStrip.every((x) => x.center === id)).toBe(true);
    expect(r.card.center).toBe(id);
    expect(r.agreement.center).toBe(id);
  });

  test('Baltim agreement and texts', () => {
    const r = getSoilMoisture('baltim');
    expect(r.agreement).toMatchObject({ agree_months: 52, agree_pct: 42, level: 'weak' });
    expect(Object.keys(r.texts)).toEqual([
      'card', 'insight1_calendar', 'insight2_typical_year', 'insight3_years',
      'insight4_satellite_vs_model', 'insight5_root', 'report',
    ]);
    expect(r.texts.insight4_satellite_vs_model.numbers).toMatch(/52 of 123 months/);
    expect(r.labels.states.dry).toBe('Drier than usual');
    expect(r.labels.agreementLevels.weak).toBe('Weak agreement');
    expect(r.limits.length).toBeGreaterThan(0);
    expect(r.dataThrough).toBe('2025-06');
  });

  test('typical year covers 3 sources x 12 months', () => {
    const r = getSoilMoisture('desouk');
    expect(new Set(r.typicalYear.map((x) => x.source))).toEqual(new Set(['sm', 'model', 'root']));
  });
});

describe('getHeatStress', () => {
  test('summary and comparison for one center, no daily arrays', () => {
    const r = getHeatStress('baltim');
    expect(r.summary).toMatchObject({ heat_days_per_year: 6.2, avg_high: 25.4 });
    expect(r.comparison.agreement.level).toBe('moderate');
    expect(r.comparison.typicalYear.wx).toHaveLength(12);
    expect(r.defaults).toEqual({ thresholdC: 35, sigma: 2 });
    expect(r.limits.length).toBeGreaterThan(0);
    expect(r.dataThrough).toEqual({ weather: '2025-12', satellite: '2025-06' });
    expect(JSON.stringify(r)).not.toMatch(/"tmax":\s*\[/);
    expect(JSON.stringify(r).length).toBeLessThan(20000);
  });

  test('Desouk keeps the heat limits that warn about the area/model', () => {
    expect(getHeatStress('desouk').limits.join(' ')).toMatch(/not a specific field/);
  });
});

describe('getLandRisk', () => {
  test('full point for the center minus the atlas "key"', () => {
    const r = getLandRisk('baltim');
    expect(r.point.id).toBe('baltim');
    expect(r.point.key).toBeUndefined();
    expect(r.point.signs).toHaveLength(4);
    expect(r.point.signs[3].question).toBe('Coast exposure (distance only)');
    expect(r.chartCatalog).toHaveLength(11);
    expect(r.statusColors.medium).toBe('#d9a23b');
    expect(r.method.disclaimer).toBeTruthy();
  });

  test('does not remove "key" from the loaded data', () => {
    getLandRisk('baltim');
    expect(getLandRisk('baltim').point.id).toBe('baltim');
  });
});

describe('getGlossary', () => {
  test('merges both glossaries, no duplicate terms, gameSection camelCase', () => {
    const { terms } = getGlossary();
    expect(terms).toHaveLength(15);
    expect(new Set(terms.map((t) => t.term.toLowerCase())).size).toBe(15);
    expect(terms[0]).toEqual({ term: 'Soil moisture', short: 'The amount of water held in the soil.', gameSection: 'soil_moisture' });
    expect(terms.some((t) => t.gameSection === 'heat_stress')).toBe(true);
    expect(terms.every((t) => t.game_section === undefined)).toBe(true);
  });
});

describe('unknown center', () => {
  test('every function returns null', () => {
    for (const fn of [getOverview, getCropHealth, getSoilMoisture, getHeatStress, getLandRisk]) {
      expect(fn('cairo')).toBeNull();
      expect(fn('__proto__')).toBeNull();
      expect(fn(undefined)).toBeNull();
    }
  });
});