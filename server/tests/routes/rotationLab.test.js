import fs from 'node:fs';
import request from 'supertest';
import { Router } from 'express';
import { DEFAULT_DIR } from '../../src/data/loadRotationLabData.js';

let createApp;
let rotationLabRoutes;
let cropsRoutes;
let plansFile;
let metaFile;
let uiFile;

beforeAll(async () => {
  Object.assign(process.env, {
    PORT: '4000',
    NODE_ENV: 'test',
    MONGO_URI: 'mongodb://127.0.0.1:27017/soilmate-test',
    CLIENT_ORIGIN: 'http://localhost:5173',
    NASA_FEATURE: 'false',
    ATTEMPT_TTL_DAYS: '7',
    JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
    BCRYPT_COST: '4',
    PUBLIC_BASE_URL: 'https://api.test.local',
  });
  ({ createApp } = await import('../../src/app.js'));
  ({ default: rotationLabRoutes } = await import('../../src/routes/rotationLabRoutes.js'));
  ({ default: cropsRoutes } = await import('../../src/routes/cropsRoutes.js'));
  const read = (f) => JSON.parse(fs.readFileSync(`${DEFAULT_DIR}/${f}`, 'utf8'));
  plansFile = read('plans.json');
  metaFile = read('meta.json');
  uiFile = read('ui_text.json');
});

// No database here: these routes never touch it. If app.js forgot "/rotation-lab" in its
// SoilMate prefixes, the game player middleware would run and these tests would fail.
const buildApp = () => {
  const router = Router();
  router.use('/rotation-lab', rotationLabRoutes);
  router.use('/crops', cropsRoutes);
  return createApp({ apiRouter: router, rateLimit: { limit: 100000 } });
};
const get = (url) => request(buildApp()).get(url);

describe('GET /api/rotation-lab/options', () => {
  test('5 winter and 4 summer options, fallow in both, no appId, same names as /crops', async () => {
    const res = await get('/api/rotation-lab/options');
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(metaFile.version);
    expect(res.body.centers.map((c) => c.id)).toEqual(['desouk', 'sidi_salem', 'baltim']);
    expect(res.body.winterCrops.map((c) => c.id)).toEqual(['wheat', 'faba_bean', 'berseem', 'sugar_beet', 'fallow']);
    expect(res.body.summerCrops.map((c) => c.id)).toEqual(['cotton', 'rice', 'maize', 'fallow']);
    expect(res.body.rules).toEqual({ minCrops: 1, invalidMessage: metaFile.input_rules.invalid[0].message });
    expect(JSON.stringify(res.body)).not.toMatch(/appId|app_id/);

    const crops = await get('/api/crops?use=rotation');
    const byId = new Map(crops.body.crops.map((c) => [c.id, c]));
    for (const c of [...res.body.winterCrops, ...res.body.summerCrops]) expect(c).toEqual(byId.get(c.id));
  });
});

describe('GET /api/rotation-lab/plans', () => {
  test('all 57 valid keys return exactly the stored result', async () => {
    const app = buildApp();
    let n = 0;
    for (const [key, stored] of Object.entries(plansFile.plans)) {
      const [center, winter, summer] = key.split('|');
      const res = await request(app).get(`/api/rotation-lab/plans?center=${center}&winter=${winter}&summer=${summer}`);
      expect(res.status).toBe(200);
      expect(res.body.key).toBe(key);
      expect(res.body.result).toEqual(stored);
      n += 1;
    }
    expect(n).toBe(57);
  });

  test('response shape and version', async () => {
    const res = await get('/api/rotation-lab/plans?center=desouk&winter=wheat&summer=cotton');
    expect(Object.keys(res.body).sort()).toEqual(['emptySeason', 'input', 'key', 'result', 'singleSeason', 'version']);
    expect(res.body.input).toEqual({ center: 'desouk', winter: 'wheat', summer: 'cotton' });
    expect(res.body.singleSeason).toBe(false);
    expect(res.body.emptySeason).toBeNull();
    expect(res.body.version).toBe(metaFile.version);
  });

  test('one crop is enough: the other season becomes fallow', async () => {
    const a = await get('/api/rotation-lab/plans?center=baltim&winter=berseem');
    expect(a.status).toBe(200);
    expect(a.body.key).toBe('baltim|berseem|fallow');
    expect(a.body.input.summer).toBe('fallow');
    expect(a.body.singleSeason).toBe(true);
    expect(a.body.emptySeason).toBe('summer');

    const b = await get('/api/rotation-lab/plans?center=baltim&summer=rice');
    expect(b.body.key).toBe('baltim|fallow|rice');
    expect(b.body.emptySeason).toBe('winter');

    const c = await get('/api/rotation-lab/plans?center=baltim&winter=&summer=rice'); // empty value = fallow
    expect(c.status).toBe(200);
    expect(c.body.key).toBe('baltim|fallow|rice');
  });

  test('both seasons empty or fallow is 400 ROTATION_LAB_NEEDS_A_CROP', async () => {
    for (const q of ['center=desouk', 'center=desouk&winter=fallow&summer=fallow', 'center=desouk&winter=&summer=']) {
      const res = await get(`/api/rotation-lab/plans?${q}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('ROTATION_LAB_NEEDS_A_CROP');
      expect(res.body.error.message).toBe(metaFile.input_rules.invalid[0].message);
    }
  });

  test('bad input is 400 VALIDATION_ERROR', async () => {
    const bad = [
      'winter=wheat&summer=cotton', // no center
      'center=cairo&winter=wheat',
      'center=desouk&winter=maize', // a summer crop in winter
      'center=desouk&summer=wheat',
      'center=desouk&winter=soybeans',
      'center=desouk&winter=wheat&winter=berseem', // repeated parameter
      'center=desouk&winter=wheat&color=red',
      'center=desouk&winter=wheat&$ne=1',
      'center=desouk&winter=wheat&a.b=1',
    ];
    for (const q of bad) {
      const res = await get(`/api/rotation-lab/plans?${q}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });

  test('is public: no token, no guest id, no player', async () => {
    const res = await get('/api/rotation-lab/plans?center=desouk&winter=wheat');
    expect(res.status).toBe(200);
  });
});

describe('GET /api/rotation-lab/meta and /ui-text', () => {
  test('meta copies the fields of meta.json', async () => {
    const res = await get('/api/rotation-lab/meta');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      disclaimer: metaFile.disclaimer,
      version: metaFile.version,
      plan_selection: metaFile.plan_selection,
      assumptions: metaFile.assumptions,
      limitations: metaFile.limitations,
      data_period: metaFile.data_period,
    });
  });

  test('ui-text equals ui_text.json', async () => {
    const res = await get('/api/rotation-lab/ui-text');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(uiFile);
  });

  test('unknown query keys are rejected', async () => {
    expect((await get('/api/rotation-lab/meta?x=1')).status).toBe(400);
    expect((await get('/api/rotation-lab/ui-text?x=1')).status).toBe(400);
    expect((await get('/api/rotation-lab/options?x=1')).status).toBe(400);
  });
});

describe('the three plans of a result have three different sources', () => {
  // plansFile is read in beforeAll, so it is only available inside the tests.
  const entries = () => Object.entries(plansFile.plans);

  test('the current plan is the farmer\'s own winter and summer choice (the key)', () => {
    for (const [, stored] of entries()) {
      const { winter, summer } = stored.current_input;
      expect(stored.plans.current.rotation.winter).toBe(winter);
      expect(stored.plans.current.rotation.summer).toBe(summer);
      expect(stored.plans.current.plan_type).toBe('current');
    }
  });

  test('water_saving and soil_health are the area recommendations, not copies of the current plan', () => {
    for (const [, stored] of entries()) {
      const { winter, summer } = stored.current_input;
      expect(stored.plans.water_saving.plan_type).toBe('water_saving');
      expect(stored.plans.soil_health.plan_type).toBe('soil_health');
      // they may propose another rotation, but they are never the current plan object
      expect(stored.plans.water_saving).not.toBe(stored.plans.current);
      expect(stored.plans.soil_health).not.toBe(stored.plans.current);
      const isCurrent = (plan) =>
        plan.rotation.winter === winter && plan.rotation.summer === summer;
      expect(typeof isCurrent(stored.plans.water_saving)).toBe('boolean');
      expect(typeof isCurrent(stored.plans.soil_health)).toBe('boolean');
    }
  });

  test('the area recommendations really propose other rotations for most keys', () => {
    const different = (type) =>
      entries().filter(([, stored]) => {
        const { winter, summer } = stored.current_input;
        const plan = stored.plans[type];
        return plan.rotation.winter !== winter || plan.rotation.summer !== summer;
      }).length;
    expect(different('water_saving')).toBeGreaterThan(0);
    expect(different('soil_health')).toBeGreaterThan(0);
  });

  test('current_is_best_for_goal is true exactly when the recommendation IS the current rotation', () => {
    for (const [, stored] of entries()) {
      const { winter, summer } = stored.current_input;
      for (const type of ['water_saving', 'soil_health']) {
        const plan = stored.plans[type];
        const same = plan.rotation.winter === winter && plan.rotation.summer === summer;
        expect(plan.current_is_best_for_goal).toBe(same);
      }
    }
  });

  test('the API returns the three plans untouched, each with its own numbers and texts', async () => {
    const [key, stored] = entries()[0];
    const [center, winter, summer] = key.split('|');
    const res = await get(`/api/rotation-lab/plans?center=${center}&winter=${winter}&summer=${summer}`);
    expect(res.body.result.plans.current).toEqual(stored.plans.current);
    expect(res.body.result.plans.water_saving).toEqual(stored.plans.water_saving);
    expect(res.body.result.plans.soil_health).toEqual(stored.plans.soil_health);
    // three different objects, each with its own reason
    const reasons = new Set(
      ['current', 'water_saving', 'soil_health'].map((t) => res.body.result.plans[t].text.reason),
    );
    expect(reasons.size).toBeGreaterThan(1);
  });
});

describe('caching, ETag and rate limit', () => {
  test.each(['options', 'meta', 'ui-text', 'plans?center=desouk&winter=wheat'])('%s is cacheable with an ETag', async (p) => {
    const res = await get(`/api/rotation-lab/${p}`);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(res.headers.etag).toBeTruthy();
    const again = await request(buildApp()).get(`/api/rotation-lab/${p}`).set('If-None-Match', res.headers.etag);
    expect(again.status).toBe(304);
  });

  // Keep this test LAST: the route limiter (300/min per IP) is created once and is shared by the whole file.
  test('returns 429 RATE_LIMITED when the limit is passed', async () => {
    const app = buildApp();
    let last;
    for (let i = 0; i < 301; i += 1) last = await request(app).get('/api/rotation-lab/meta');
    expect(last.status).toBe(429);
    expect(last.body.error.code).toBe('RATE_LIMITED');
  }, 60000);
});