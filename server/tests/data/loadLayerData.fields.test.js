import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadLayerData } from '../../src/data/loadLayerData.js';

const SRC = path.resolve('src/data/layers');

let tmp;
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(tmp, rel), 'utf8'));
const writeJson = (rel, obj) => fs.writeFileSync(path.join(tmp, rel), JSON.stringify(obj));

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'layers-'));
  fs.cpSync(SRC, tmp, { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('loadLayerData - fields the API reads', () => {
  test('sm_calendar state outside dry/normal/wet/no_data', () => {
    const rows = readJson('soil_moisture/sm_calendar.json');
    rows[5].sm_state = 'soggy';
    writeJson('soil_moisture/sm_calendar.json', rows);
    expect(() => loadLayerData(tmp)).toThrow(/invalid sm_state/);
  });

  test('sm_calendar null value', () => {
    const rows = readJson('soil_moisture/sm_calendar.json');
    rows[10].model_pct = null;
    writeJson('soil_moisture/sm_calendar.json', rows);
    expect(() => loadLayerData(tmp)).toThrow(/model_pct is null/);
  });

  test('sm_card needle is not a number', () => {
    const rows = readJson('soil_moisture/sm_card.json');
    rows[0].sm_needle = '9';
    writeJson('soil_moisture/sm_card.json', rows);
    expect(() => loadLayerData(tmp)).toThrow(/sm_needle/);
  });

  test('sm_meta without a state label', () => {
    const m = readJson('soil_moisture/sm_meta.json');
    delete m.state_labels.dry;
    writeJson('soil_moisture/sm_meta.json', m);
    expect(() => loadLayerData(tmp)).toThrow(/state_labels\.dry/);
  });

  test('NDVI level id outside low/mid/good', () => {
    const n = readJson('ndvi/ndvi_feature.json');
    n.centers.Desouk.latest.level.id = 'great';
    writeJson('ndvi/ndvi_feature.json', n);
    expect(() => loadLayerData(tmp)).toThrow(/latest is incomplete/);
  });

  test('NDVI color stops malformed', () => {
    const n = readJson('ndvi/ndvi_feature.json');
    n.ui.ndvi_color_stops = [[0.2, 'red']];
    writeJson('ndvi/ndvi_feature.json', n);
    expect(() => loadLayerData(tmp)).toThrow(/ndvi_color_stops/);
  });

  test('heat meta.end not a date', () => {
    const h = readJson('heat/heat_stress_data.json');
    h.meta.end = 'December 2025';
    writeJson('heat/heat_stress_data.json', h);
    expect(() => loadLayerData(tmp)).toThrow(/meta\.end/);
  });

  test('heat summary hottest has the wrong shape', () => {
    const h = readJson('heat/heat_stress_data.json');
    h.summary_default.desouk.hottest = 46.54;
    writeJson('heat/heat_stress_data.json', h);
    expect(() => loadLayerData(tmp)).toThrow(/hottest/);
  });

  test('atlas risk level outside Low/Medium/High', () => {
    const a = readJson('atlas/desertification_atlas.json');
    a.points.baltim.risk.level = 'Severe';
    writeJson('atlas/desertification_atlas.json', a);
    expect(() => loadLayerData(tmp)).toThrow(/risk\.level/);
  });

  test('atlas missing a status color', () => {
    const a = readJson('atlas/desertification_atlas.json');
    delete a.status_colors.medium;
    writeJson('atlas/desertification_atlas.json', a);
    expect(() => loadLayerData(tmp)).toThrow(/status_colors\.medium/);
  });

  test('atlas site number missing', () => {
    const a = readJson('atlas/desertification_atlas.json');
    a.points.desouk.elevation_m = null;
    writeJson('atlas/desertification_atlas.json', a);
    expect(() => loadLayerData(tmp)).toThrow(/elevation_m/);
  });
});