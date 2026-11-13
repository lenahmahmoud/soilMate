import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_DIR, loadRotationLabData } from '../../src/data/loadRotationLabData.js';

let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rlab-'));
  fs.cpSync(DEFAULT_DIR, tmp, { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const read = (f) => JSON.parse(fs.readFileSync(path.join(tmp, f), 'utf8'));
const write = (f, v) => fs.writeFileSync(path.join(tmp, f), JSON.stringify(v));

describe('loadRotationLabData: the delivered files', () => {
  test('load, join the crops and index the 57 results', () => {
    const d = loadRotationLabData(DEFAULT_DIR);
    expect(d.plansByKey.size).toBe(57);
    expect(d.cropOrder).toEqual(['wheat', 'faba_bean', 'berseem', 'sugar_beet', 'cotton', 'rice', 'maize']);
    expect([...d.cropsById.keys()]).toEqual([...d.cropOrder, 'fallow']);
    expect(d.cropsById.get('fallow').season).toBe('any');
    expect(d.cropsById.get('wheat').traits.season_length_days).toBe(180);
    expect(d.plansByKey.has('baltim|berseem|fallow')).toBe(true);
    expect(d.plansByKey.has('baltim|fallow|fallow')).toBe(false);
  });

  test('the data is frozen (nobody can change it by accident)', () => {
    const d = loadRotationLabData(DEFAULT_DIR);
    expect(Object.isFrozen(d.plansByKey.get('desouk|wheat|cotton'))).toBe(true);
    expect(Object.isFrozen(d.cropsById.get('wheat'))).toBe(true);
    expect(Object.isFrozen(d.meta)).toBe(true);
  });

  test('a version difference between meta and ui_text is a warning, not an error', () => {
    const warnings = [];
    loadRotationLabData(DEFAULT_DIR, { onWarn: (m) => warnings.push(m) });
    expect(warnings.length).toBeLessThanOrEqual(1);
  });
});

describe('loadRotationLabData: it refuses bad data', () => {
  test('a missing file', () => {
    fs.rmSync(path.join(tmp, 'ui_text.json'));
    expect(() => loadRotationLabData(tmp)).toThrow(/missing file/);
  });

  test('invalid JSON', () => {
    fs.writeFileSync(path.join(tmp, 'meta.json'), '{ not json');
    expect(() => loadRotationLabData(tmp)).toThrow(/invalid JSON/);
  });

  test('56 keys instead of 57', () => {
    const p = read('plans.json');
    delete p.plans['desouk|wheat|cotton'];
    write('plans.json', p);
    expect(() => loadRotationLabData(tmp)).toThrow(/56 keys|missing key/);
  });

  test('an extra key', () => {
    const p = read('plans.json');
    p.plans['desouk|fallow|fallow'] = p.plans['desouk|wheat|cotton'];
    write('plans.json', p);
    expect(() => loadRotationLabData(tmp)).toThrow(/keys/);
  });

  test('a result without the 3 plans', () => {
    const p = read('plans.json');
    delete p.plans['baltim|wheat|rice'].plans.soil_health;
    write('plans.json', p);
    expect(() => loadRotationLabData(tmp)).toThrow(/exactly the plans/);
  });

  test('an empty text field', () => {
    const p = read('plans.json');
    p.plans['baltim|wheat|rice'].plans.current.text.reason = '  ';
    write('plans.json', p);
    expect(() => loadRotationLabData(tmp)).toThrow(/text\.reason is empty/);
  });

  test('an empty evidence list', () => {
    const p = read('plans.json');
    p.plans['baltim|wheat|rice'].plans.water_saving.text.evidence = [];
    write('plans.json', p);
    expect(() => loadRotationLabData(tmp)).toThrow(/text\.evidence is empty/);
  });

  test('warnings that is not a list', () => {
    const p = read('plans.json');
    p.plans['baltim|wheat|rice'].plans.current.warnings = null;
    write('plans.json', p);
    expect(() => loadRotationLabData(tmp)).toThrow(/warnings must be a list/);
  });

  test('a catalog crop that is not in crops.json', () => {
    const c = read('crops.json').filter((x) => x.id !== 'rice');
    write('crops.json', c);
    expect(() => loadRotationLabData(tmp)).toThrow(/"rice" is in crop_catalog.json but not in crops.json/);
  });

  test('a crops.json crop that is not in the catalog (the reverse check)', () => {
    const cat = read('crop_catalog.json');
    cat.crops = cat.crops.filter((x) => x.id !== 'rice');
    write('crop_catalog.json', cat);
    expect(() => loadRotationLabData(tmp)).toThrow(/"rice" is in crops.json but not in crop_catalog.json/);
  });

  test('a crop with a different name in the two files', () => {
    const c = read('crops.json');
    c.find((x) => x.id === 'wheat').name = 'Wheat (old)';
    write('crops.json', c);
    expect(() => loadRotationLabData(tmp)).toThrow(/name is empty or differs/);
  });

  test('meta options that differ from the code', () => {
    const m = read('meta.json');
    m.input_rules.summer_options = ['cotton', 'rice', 'fallow'];
    write('meta.json', m);
    expect(() => loadRotationLabData(tmp)).toThrow(/summer_options/);
  });

  test('a missing center in centers.json', () => {
    write('centers.json', read('centers.json').slice(0, 2));
    expect(() => loadRotationLabData(tmp)).toThrow(/centers must be exactly/);
  });
});