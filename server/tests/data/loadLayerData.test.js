import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadLayerData, initLayerData, getLayerData, resetLayerData } from '../../src/data/loadLayerData.js';

const SRC = path.resolve('src/data/layers');
const CENTERS = ['desouk', 'sidi_salem', 'baltim'];

let tmp;
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(tmp, rel), 'utf8'));
const writeJson = (rel, obj) => fs.writeFileSync(path.join(tmp, rel), JSON.stringify(obj));

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'layers-'));
  fs.cpSync(SRC, tmp, { recursive: true });
});
afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
  resetLayerData();
});

describe('loadLayerData - happy path', () => {
  test('loads all four layers for exactly the 3 centers', () => {
    const d = loadLayerData(SRC);
    for (const id of CENTERS) {
      expect(d.soilMoisture.calendar[id]).toHaveLength(123);
      expect(d.soilMoisture.typicalYear[id]).toHaveLength(36);
      expect(d.soilMoisture.yearsStrip[id]).toHaveLength(11);
      expect(d.ndvi.centers[id].insights).toHaveLength(6);
      expect(d.atlas.points[id].signs).toHaveLength(4);
    }
    expect(d.heat.n).toBe(4018);
  });

  test('NDVI keys are lowercased (Sidi_Salem -> sidi_salem)', () => {
    const d = loadLayerData(SRC);
    expect(Object.keys(d.ndvi.centers).sort()).toEqual([...CENTERS].sort());
  });

  test('atlas is indexed by id, not by key', () => {
    const d = loadLayerData(SRC);
    expect(d.atlas.points.sidi_salem.id).toBe('sidi_salem');
    expect(d.atlas.points.SidiSalem).toBeUndefined();
  });

  test('values are copied unchanged from the source file', () => {
    const d = loadLayerData(SRC);
    const src = readJson('soil_moisture/sm_card.json').find((r) => r.center === 'desouk');
    expect(d.soilMoisture.card.desouk[0]).toEqual(src);
    expect(d.soilMoisture.card.desouk[0].sm_needle).toBe(9);
  });

  test('salinity sign is relabelled as distance-only', () => {
    const d = loadLayerData(SRC);
    for (const id of CENTERS) {
      expect(d.atlas.points[id].signs[3].question).toBe('Coast exposure (distance only)');
    }
  });

  test('getLayerData throws before init and returns data after', () => {
    expect(() => getLayerData()).toThrow(/not loaded/);
    initLayerData(SRC);
    expect(getLayerData().heat.n).toBe(4018);
  });
});

describe('loadLayerData - fail fast', () => {
  test('missing file', () => {
    fs.rmSync(path.join(tmp, 'ndvi/ndvi_feature.json'));
    expect(() => loadLayerData(tmp)).toThrow(/missing file/);
  });

  test('invalid JSON', () => {
    fs.writeFileSync(path.join(tmp, 'soil_moisture/sm_card.json'), '{ not json');
    expect(() => loadLayerData(tmp)).toThrow(/invalid JSON/);
  });

  test('wrong sm_calendar row count', () => {
    const rows = readJson('soil_moisture/sm_calendar.json');
    writeJson('soil_moisture/sm_calendar.json', rows.slice(1));
    expect(() => loadLayerData(tmp)).toThrow(/sm_calendar/);
  });

  test('unknown center in a soil-moisture file', () => {
    const rows = readJson('soil_moisture/sm_card.json');
    rows[0].center = 'cairo';
    writeJson('soil_moisture/sm_card.json', rows);
    expect(() => loadLayerData(tmp)).toThrow(/unknown center/);
  });

  test('NDVI center with a bad bbox', () => {
    const n = readJson('ndvi/ndvi_feature.json');
    n.centers.Desouk.bbox = [1, 2, 3];
    writeJson('ndvi/ndvi_feature.json', n);
    expect(() => loadLayerData(tmp)).toThrow(/bbox/);
  });

  test('NDVI center with 5 insights', () => {
    const n = readJson('ndvi/ndvi_feature.json');
    n.centers.Baltim.insights.pop();
    writeJson('ndvi/ndvi_feature.json', n);
    expect(() => loadLayerData(tmp)).toThrow(/insights/);
  });

  test('NDVI missing chart E', () => {
    const n = readJson('ndvi/ndvi_feature.json');
    delete n.charts.E;
    writeJson('ndvi/ndvi_feature.json', n);
    expect(() => loadLayerData(tmp)).toThrow(/charts/);
  });

  test('heat daily array with the wrong length', () => {
    const h = readJson('heat/heat_stress_data.json');
    h.daily.coast.tmax.pop();
    writeJson('heat/heat_stress_data.json', h);
    expect(() => loadLayerData(tmp)).toThrow(/daily\.coast\.tmax/);
  });

  test('heat n changed', () => {
    const h = readJson('heat/heat_stress_data.json');
    h.n = 100;
    writeJson('heat/heat_stress_data.json', h);
    expect(() => loadLayerData(tmp)).toThrow(/heat: n is/);
  });

  test('atlas point with 3 signs', () => {
    const a = readJson('atlas/desertification_atlas.json');
    a.points.desouk.signs.pop();
    writeJson('atlas/desertification_atlas.json', a);
    expect(() => loadLayerData(tmp)).toThrow(/signs/);
  });

  test('atlas missing a center', () => {
    const a = readJson('atlas/desertification_atlas.json');
    delete a.points.baltim;
    writeJson('atlas/desertification_atlas.json', a);
    expect(() => loadLayerData(tmp)).toThrow(/atlas: points must be exactly/);
  });

  test('empty required text', () => {
    const t = readJson('soil_moisture/texts_soil_moisture.json');
    t.centers.desouk.report.observed = '  ';
    writeJson('soil_moisture/texts_soil_moisture.json', t);
    expect(() => loadLayerData(tmp)).toThrow(/report\.observed/);
  });
});

test('Arabic fields are not required by the loader', () => {
  const h = readJson('heat/heat_stress_data.json');
  delete h.ar;
  writeJson('heat/heat_stress_data.json', h);
  expect(() => loadLayerData(tmp)).not.toThrow();
});