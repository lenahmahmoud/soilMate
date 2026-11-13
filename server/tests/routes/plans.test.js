import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { Router } from 'express';

// If C7 names a different code for "no saved rotation", change it here.
const NO_ROTATION_CODE = 'ROTATION_NOT_SET';

let mongod;
let User;
let Farm;
let ActivePlan;
let createApp;
let farmRoutes;
let plansRoutes;
let getRotationLabData;
let choosePlan;
let app;

const SRC_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../src',
);

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
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  ({ default: User } = await import('../../src/models/User.js'));
  ({ default: Farm } = await import('../../src/models/Farm.js'));
  ({ default: ActivePlan } = await import('../../src/models/ActivePlan.js'));
  ({ createApp } = await import('../../src/app.js'));
  ({ default: farmRoutes } = await import('../../src/routes/farmRoutes.js'));
  ({ default: plansRoutes } = await import('../../src/routes/plansRoutes.js'));
  ({ getRotationLabData } = await import('../../src/data/loadRotationLabData.js'));
  ({ choosePlan } = await import('../../src/services/planService.js'));
  await User.init();
  await Farm.init();
  await ActivePlan.init(); // builds the unique "one active plan per user" index
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(() => {
  const router = Router();
  router.use('/farm', farmRoutes);
  router.use('/plans', plansRoutes);
  app = createApp({ apiRouter: router, rateLimit: { limit: 100000 } });
});

afterEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

const G1 = '3f2b8a52-6c1e-4b7d-9a35-0d4f7e1c2b90';
const G2 = '9d1c4e77-2a0b-4f63-8e15-7b3a6c5d8e21';
const asGuest = (id) => ({ 'X-Guest-Id': id });

const PLAN_TYPES = ['current', 'water_saving', 'soil_health'];
const ROTATION = { winter: 'wheat', summer: 'maize' };

const setCenter = (id, centerId = 'desouk') =>
  request(app).put('/api/farm/center').set(asGuest(id)).send({ centerId });
const putRotation = (id, body) => request(app).put('/api/farm/rotation').set(asGuest(id)).send(body);
const prepare = async (id, rotation = ROTATION, centerId = 'desouk') => {
  await setCenter(id, centerId);
  return putRotation(id, rotation);
};
const choose = (id, body) => request(app).post('/api/plans/choose').set(asGuest(id)).send(body);
const active = (id) => request(app).get('/api/plans/active').set(asGuest(id));
const stored = (key, type) => getRotationLabData().plansByKey.get(key).plans[type];
const isoDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

describe('access', () => {
  test('no token and no guest id gives 401 on both routes', async () => {
    expect((await request(app).post('/api/plans/choose').send({ planKey: 'current' })).status).toBe(401);
    expect((await request(app).get('/api/plans/active')).status).toBe(401);
  });

  test('the answers are never cached', async () => {
    await prepare(G1);
    const res = await active(G1);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('a malformed guest id gives 400 INVALID_GUEST_ID', async () => {
    const res = await request(app).get('/api/plans/active').set(asGuest('1234'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_GUEST_ID');
  });

  test('the old compare route is gone', async () => {
    const res = await request(app).post('/api/plans/compare').set(asGuest(G1)).send({});
    expect(res.status).toBe(404);
  });
});

describe('POST /plans/choose: guards', () => {
  test('without an area it gives 409 FARM_SETUP_INCOMPLETE', async () => {
    const res = await choose(G1, { planKey: 'current' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('FARM_SETUP_INCOMPLETE');
    expect(await ActivePlan.countDocuments()).toBe(0);
  });

  test('with an area but no saved rotation it gives the conflict response', async () => {
    await setCenter(G1);
    const res = await choose(G1, { planKey: 'current' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(NO_ROTATION_CODE);
    expect(await ActivePlan.countDocuments()).toBe(0);
  });

  test('a rejected rotation save still leaves the farm without a rotation', async () => {
    await setCenter(G1);
    await putRotation(G1, {}); // 400
    const res = await choose(G1, { planKey: 'current' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(NO_ROTATION_CODE);
  });

  test('a farm from before the update (no rotationInput) gives the same conflict', async () => {
    await setCenter(G1);
    await Farm.collection.updateMany({}, { $unset: { rotationInput: '' } });
    const res = await choose(G1, { planKey: 'current' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe(NO_ROTATION_CODE);
  });
});

describe('POST /plans/choose: choosing', () => {
  test('returns the ActivePlan built from the saved rotation', async () => {
    await prepare(G1);
    const res = await choose(G1, { planKey: 'current' });
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual([
      'chosenAt', 'dataVersion', 'id', 'input', 'key', 'plan', 'planKey', 'startDate',
    ]);
    expect(res.body.planKey).toBe('current');
    expect(res.body.key).toBe('desouk|wheat|maize');
    expect(res.body.input).toEqual({ center: 'desouk', winter: 'wheat', summer: 'maize' });
    expect(res.body.dataVersion).toBe(getRotationLabData().meta.version);
    expect(res.body.startDate).toBe(isoDay(0));
    expect(res.body).not.toHaveProperty('dataChangedSinceChosen');
    expect(res.body).not.toHaveProperty('userId');
    expect(res.body).not.toHaveProperty('archivedAt');
  });

  test('the plan is the Rotation Lab result, unchanged', async () => {
    await prepare(G1);
    const res = await choose(G1, { planKey: 'soil_health' });
    expect(res.body.plan).toEqual(stored('desouk|wheat|maize', 'soil_health'));
  });

  test.each(PLAN_TYPES)('the %s plan can be chosen', async (planKey) => {
    await prepare(G1);
    const res = await choose(G1, { planKey });
    expect(res.status).toBe(201);
    expect(res.body.planKey).toBe(planKey);
    expect(res.body.plan).toEqual(stored('desouk|wheat|maize', planKey));
  });

  test('the key follows the farm area and rotation', async () => {
    await prepare(G1, { winter: 'berseem', summer: 'rice' }, 'baltim');
    const res = await choose(G1, { planKey: 'water_saving' });
    expect(res.body.key).toBe('baltim|berseem|rice');
    expect(res.body.input).toEqual({ center: 'baltim', winter: 'berseem', summer: 'rice' });
    expect(res.body.plan).toEqual(stored('baltim|berseem|rice', 'water_saving'));
  });

  test('a one-crop rotation works (the other season is fallow)', async () => {
    await prepare(G1, { winter: 'wheat' });
    const res = await choose(G1, { planKey: 'current' });
    expect(res.status).toBe(201);
    expect(res.body.key).toBe('desouk|wheat|fallow');
    expect(res.body.input.summer).toBe('fallow');
    expect(res.body.plan).toEqual(stored('desouk|wheat|fallow', 'current'));
  });

  test('the ActivePlan is stored with the reference, not a copy of the plan', async () => {
    await prepare(G1);
    await choose(G1, { planKey: 'current' });
    const doc = await ActivePlan.findOne().lean();
    expect(doc.key).toBe('desouk|wheat|maize');
    expect(doc.archivedAt).toBeNull(); // stored as null, never missing
    expect(doc.dataVersion).toBe(getRotationLabData().meta.version);
    expect(doc).not.toHaveProperty('plan');
    expect(doc).not.toHaveProperty('sequence');
    expect(doc).not.toHaveProperty('planSetId');
  });
});

describe('POST /plans/choose: start date', () => {
  test('a given start date is kept', async () => {
    await prepare(G1);
    const start = isoDay(10);
    const res = await choose(G1, { planKey: 'current', startDate: start });
    expect(res.status).toBe(201);
    expect(res.body.startDate).toBe(start);
  });

  test('a date in the past within 2 years is accepted', async () => {
    await prepare(G1);
    const res = await choose(G1, { planKey: 'current', startDate: isoDay(-30) });
    expect(res.status).toBe(201);
  });

  test('a date more than 2 years away is rejected', async () => {
    await prepare(G1);
    for (const startDate of [isoDay(-800), isoDay(800)]) {
      const res = await choose(G1, { planKey: 'current', startDate });
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('POST /plans/choose: validation', () => {
  test.each([
    ['no body', {}],
    ['an old plan key', { planKey: 'my_plan' }],
    ['another old plan key', { planKey: 'area_plan_a' }],
    ['an unknown plan key', { planKey: 'keep_routine' }],
    ['the old planSetId', { planSetId: '0123456789abcdef01234567', planKey: 'current' }],
    ['a rotation in the body', { planKey: 'current', winter: 'wheat', summer: 'maize' }],
    ['a center in the body', { planKey: 'current', center: 'baltim' }],
    ['a bad date format', { planKey: 'current', startDate: 'tomorrow' }],
    ['a date that does not exist', { planKey: 'current', startDate: '2026-02-30' }],
    ['a $ key', { planKey: 'current', $ne: 1 }],
  ])('%s gives 400 VALIDATION_ERROR and saves nothing', async (name, body) => {
    await prepare(G1);
    const res = await choose(G1, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await ActivePlan.countDocuments()).toBe(0);
  });
});

describe('only one active plan', () => {
  test('choosing twice archives the first plan', async () => {
    await prepare(G1);
    const first = await choose(G1, { planKey: 'current' });
    const second = await choose(G1, { planKey: 'water_saving' });

    expect(await ActivePlan.countDocuments()).toBe(2);
    expect(await ActivePlan.countDocuments({ archivedAt: null })).toBe(1);

    const archived = await ActivePlan.findById(first.body.id).lean();
    expect(archived.archivedAt).toBeInstanceOf(Date);

    const res = await active(G1);
    expect(res.body.activePlan.id).toBe(second.body.id);
    expect(res.body.activePlan.planKey).toBe('water_saving');
  });

  test('choosing after a rotation change uses the new rotation', async () => {
    await prepare(G1);
    await choose(G1, { planKey: 'current' });
    await putRotation(G1, { winter: 'berseem', summer: 'rice' });
    const res = await choose(G1, { planKey: 'current' });
    expect(res.body.key).toBe('desouk|berseem|rice');
    expect(await ActivePlan.countDocuments({ archivedAt: null })).toBe(1);
  });

  test('two parallel choices still leave exactly one active plan', async () => {
    await prepare(G1);
    const [a, b] = await Promise.all([
      choose(G1, { planKey: 'current' }),
      choose(G1, { planKey: 'soil_health' }),
    ]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(await ActivePlan.countDocuments({ archivedAt: null })).toBe(1);
  });

  test('a failing insert does not archive the current plan', async () => {
    await prepare(G1);
    await choose(G1, { planKey: 'current' });
    const guest = await User.findOne({ guestId: G1 }).lean();

    // Invalid start date: the new plan fails validation BEFORE anything is archived.
    await expect(
      choosePlan(String(guest._id), { planKey: 'soil_health', startDate: 'garbage' }),
    ).rejects.toThrow();

    expect(await ActivePlan.countDocuments({ archivedAt: null })).toBe(1);
    const res = await active(G1);
    expect(res.body.activePlan.planKey).toBe('current');
  });
});

describe('GET /plans/active', () => {
  test('returns null when nothing was chosen', async () => {
    const res = await active(G1);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ activePlan: null });
  });
  test('returns the chosen plan with its Rotation Lab content', async () => {
    await prepare(G1);
    const chosen = await choose(G1, { planKey: 'current', startDate: isoDay(5) });
    const res = await active(G1);
    expect(res.status).toBe(200);
    expect(res.body.activePlan).toEqual(chosen.body);
    expect(res.body.activePlan.plan).toEqual(stored('desouk|wheat|maize', 'current'));
  });

  test('flags a plan chosen with older data, and returns the current plan', async () => {
    await prepare(G1);
    await choose(G1, { planKey: 'current' });
    await ActivePlan.updateOne({}, { $set: { dataVersion: 'old-version' } });
    const res = await active(G1);
    expect(res.body.activePlan.dataChangedSinceChosen).toBe(true);
    expect(res.body.activePlan.dataVersion).toBe('old-version');
    expect(res.body.activePlan.plan).toEqual(stored('desouk|wheat|maize', 'current'));
  });

  test("one guest never sees another guest's plan", async () => {
    await prepare(G1);
    await choose(G1, { planKey: 'current' });
    const res = await active(G2);
    expect(res.body).toEqual({ activePlan: null });
  });

  test('a document of the retired plan shape does not break the endpoint', async () => {
    // A database that was not migrated yet must not 500: the mapper reports no plan.
    await request(app).get('/api/farm').set(asGuest(G1)); // creates the guest user
    const guest = await User.findOne({ guestId: G1 }).lean();
    await ActivePlan.collection.insertOne({
      _id: new mongoose.Types.ObjectId(),
      userId: guest._id,
      planSetId: new mongoose.Types.ObjectId(),
      planKey: 'improve_soil',
      title: 'Improve My Soil',
      startDate: new Date('2026-11-15'),
      status: 'placeholder',
      modelVersion: 'mock-0.1',
      sequence: [{ slot: 'fall_winter', cropId: 'winter-rye' }],
      archivedAt: null,
    });

    const res = await active(G1);
    expect(res.status).toBe(200);
    expect(res.body.activePlan).not.toBeNull();
    expect(res.body.activePlan.plan).toBeNull();
    expect(res.body.activePlan.dataChangedSinceChosen).toBe(true);
    expect(res.body.activePlan.key).toBeNull();
    expect(res.body.activePlan.input).toBeNull();
  });
});

describe('the three plans come from three different sources', () => {
  // desouk|wheat|maize: the farmer's own rotation, the water recommendation and the
  // soil recommendation are three different rotations with three different texts.
  const KEY = 'desouk|wheat|maize';

  test('the current plan is the farmer\'s own winter and summer choice', async () => {
    await prepare(G1, { winter: 'wheat', summer: 'maize' }, 'desouk');
    const res = await choose(G1, { planKey: 'current' });
    expect(res.status).toBe(201);
    expect(res.body.plan).toEqual(stored(KEY, 'current'));
    expect(res.body.plan.plan_type).toBe('current');
    expect(res.body.plan.rotation.winter).toBe('wheat');
    expect(res.body.plan.rotation.summer).toBe('maize');
  });

  test('water_saving and soil_health are the area recommendations for the same rotation', async () => {
    await prepare(G1, { winter: 'wheat', summer: 'maize' }, 'desouk');
    const current = (await choose(G1, { planKey: 'current' })).body.plan;
    const water = (await choose(G1, { planKey: 'water_saving' })).body.plan;
    const soil = (await choose(G1, { planKey: 'soil_health' })).body.plan;

    expect(water).toEqual(stored(KEY, 'water_saving'));
    expect(soil).toEqual(stored(KEY, 'soil_health'));
    expect(water.plan_type).toBe('water_saving');
    expect(soil.plan_type).toBe('soil_health');

    // three different sources: three different rotations and three different texts
    const rotations = new Set([current.rotation.label, water.rotation.label, soil.rotation.label]);
    expect(rotations.size).toBe(3);
    const reasons = new Set([current.text.reason, water.text.reason, soil.text.reason]);
    expect(reasons.size).toBe(3);
  });

  test('the recommendations are not recalculated: the numbers come from the data file', async () => {
    await prepare(G1, { winter: 'wheat', summer: 'maize' }, 'desouk');
    const water = (await choose(G1, { planKey: 'water_saving' })).body.plan;
    expect(water.numbers).toEqual(stored(KEY, 'water_saving').numbers);
    expect(water.text).toEqual(stored(KEY, 'water_saving').text);
    expect(water.warnings).toEqual(stored(KEY, 'water_saving').warnings);
  });

  test('when the area recommendation IS the current rotation it is still its own plan', async () => {
    // sidi_salem|fallow|cotton: the current plan is already the lowest-water option.
    await prepare(G1, { winter: 'fallow', summer: 'cotton' }, 'sidi_salem');
    const res = await choose(G1, { planKey: 'water_saving' });
    const areaPlan = stored('sidi_salem|fallow|cotton', 'water_saving');
    expect(res.body.plan).toEqual(areaPlan);
    expect(res.body.plan.current_is_best_for_goal).toBe(true);
    // the same rotation, but the water_saving plan and not the current plan
    expect(res.body.plan.rotation).toEqual(stored('sidi_salem|fallow|cotton', 'current').rotation);
    expect(res.body.plan.text.reason).toBe(areaPlan.text.reason);
    expect(res.body.plan.text.reason).not.toBe(
      stored('sidi_salem|fallow|cotton', 'current').text.reason,
    );
  });

  test('the ActivePlan keeps only the reference, so the right source is resolved later', async () => {
    await prepare(G1, { winter: 'wheat', summer: 'maize' }, 'desouk');
    await choose(G1, { planKey: 'soil_health' });
    const doc = await ActivePlan.findOne().lean();
    expect(doc.key).toBe(KEY);
    expect(doc.planKey).toBe('soil_health');
    expect(doc.input).toEqual({ center: 'desouk', winter: 'wheat', summer: 'maize' });
    expect(doc.dataVersion).toBe(getRotationLabData().meta.version);
    expect(doc).not.toHaveProperty('plan');

    // ... and GET /plans/active resolves the soil recommendation, not the current plan
    const res = await active(G1);
    expect(res.body.activePlan.plan).toEqual(stored(KEY, 'soil_health'));
  });

  test('the farmer\'s own rotation decides the key, the area decides the recommendations', async () => {
    await prepare(G1, { winter: 'wheat', summer: 'maize' }, 'desouk');
    const desouk = (await choose(G1, { planKey: 'soil_health' })).body;
    await prepare(G2, { winter: 'berseem', summer: 'rice' }, 'baltim');
    const baltim = (await choose(G2, { planKey: 'soil_health' })).body;

    expect(desouk.key).toBe('desouk|wheat|maize');
    expect(baltim.key).toBe('baltim|berseem|rice');
    expect(desouk.plan).not.toEqual(baltim.plan);
    expect(desouk.plan).toEqual(stored('desouk|wheat|maize', 'soil_health'));
    expect(baltim.plan).toEqual(stored('baltim|berseem|rice', 'soil_health'));
  });
});

describe('the retired compare and scoring flow does not interfere', () => {
  test('no ranking, no match score and no recommendation in the answers', async () => {
    await prepare(G1);
    const chosen = await choose(G1, { planKey: 'current' });
    for (const body of [chosen.body, (await active(G1)).body.activePlan]) {
      expect(body).not.toHaveProperty('matchScore');
      expect(body).not.toHaveProperty('rank');
      expect(body).not.toHaveProperty('recommended');
      expect(body).not.toHaveProperty('recommendedLabel');
      expect(body).not.toHaveProperty('planSetId');
    }
  });

  test('nothing is written in the retired plan storage', async () => {
    await prepare(G1);
    await choose(G1, { planKey: 'soil_health' });
    expect(await ActivePlan.countDocuments({ archivedAt: null })).toBe(1);
  });

  test('the live Phase 1 and Phase 2 modules never import the old scoring service or PlanSet', () => {
    const files = [
      'services/planService.js',
      'services/farmService.js',
      'services/rotationLabService.js',
      'services/cropService.js',
      'mappers/planMapper.js',
      'mappers/farmMapper.js',
      'mappers/cropMapper.js',
      'controllers/plansController.js',
      'routes/plansRoutes.js',
      'routes/farmRoutes.js',
    ];
    for (const file of files) {
      const text = fs.readFileSync(path.join(SRC_DIR, file), 'utf8');
      expect(text).not.toMatch(/services\/scoring|scoring\/index/);
      expect(text).not.toMatch(/models\/PlanSet/);
    }
  });
});