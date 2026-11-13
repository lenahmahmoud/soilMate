import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { Router } from 'express';

let mongod;
let Farm;
let ActivePlan;
let createApp;
let farmRoutes;
let plansRoutes;
let app;

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
  ({ default: Farm } = await import('../../src/models/Farm.js'));
  ({ default: ActivePlan } = await import('../../src/models/ActivePlan.js'));
  ({ createApp } = await import('../../src/app.js'));
  ({ default: farmRoutes } = await import('../../src/routes/farmRoutes.js'));
  ({ default: plansRoutes } = await import('../../src/routes/plansRoutes.js'));
  await Farm.init();
  await ActivePlan.init();
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

const FORM = {
  currentCrops: ['wheat'],
  waterSource: 'rain',
  waterSourceOther: null,
  waterAvailability: 'usually_enough',
  soilType: 'loamy',
  equipment: [],
  seasonsPerYear: 2,
  priorities: ['save_water'],
};

const setCenter = (id, centerId = 'desouk') =>
  request(app).put('/api/farm/center').set(asGuest(id)).send({ centerId });
const putRotation = (id, body) => request(app).put('/api/farm/rotation').set(asGuest(id)).send(body);
const getFarm = (id) => request(app).get('/api/farm').set(asGuest(id));

describe('PUT /farm/rotation: access and guard', () => {
  test('no token and no guest id gives 401', async () => {
    const res = await request(app).put('/api/farm/rotation').send({ winter: 'wheat' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('the farm answers are never cached', async () => {
    const res = await getFarm(G1);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('a malformed guest id gives 400 INVALID_GUEST_ID', async () => {
    const res = await request(app).put('/api/farm/rotation').set(asGuest('1234')).send({ winter: 'wheat' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_GUEST_ID');
  });

  test('without an area it gives 409 FARM_SETUP_INCOMPLETE and saves nothing', async () => {
    const res = await putRotation(G1, { winter: 'wheat', summer: 'maize' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('FARM_SETUP_INCOMPLETE');
    const farm = await getFarm(G1);
    expect(farm.body.rotationInput).toEqual({ winter: null, summer: null });
  });

  test('an area is enough: the farm form does not have to be complete', async () => {
    await setCenter(G1);
    const res = await putRotation(G1, { winter: 'wheat', summer: 'maize' });
    expect(res.status).toBe(200);
    expect(res.body.setupStatus).toBe('center_selected');
  });
});

describe('PUT /farm/rotation: saving', () => {
  test('saves winter and summer and returns the Farm object', async () => {
    await setCenter(G1);
    const res = await putRotation(G1, { winter: 'wheat', summer: 'maize' });
    expect(res.status).toBe(200);
    expect(res.body.rotationInput).toEqual({ winter: 'wheat', summer: 'maize' });
    expect(res.body.centerId).toBe('desouk');
    expect(res.body).not.toHaveProperty('userId');
    const again = await getFarm(G1);
    expect(again.body.rotationInput).toEqual({ winter: 'wheat', summer: 'maize' });
  });

  test('a new farm starts with no rotation', async () => {
    const res = await getFarm(G1);
    expect(res.body.rotationInput).toEqual({ winter: null, summer: null });
  });

  test('a second save replaces the first', async () => {
    await setCenter(G1);
    await putRotation(G1, { winter: 'wheat', summer: 'maize' });
    const res = await putRotation(G1, { winter: 'berseem', summer: 'rice' });
    expect(res.body.rotationInput).toEqual({ winter: 'berseem', summer: 'rice' });
    expect(await Farm.countDocuments()).toBe(1);
  });

  test('every winter and summer crop id is accepted', async () => {
    await setCenter(G1);
    for (const winter of ['wheat', 'faba_bean', 'berseem', 'sugar_beet']) {
      expect((await putRotation(G1, { winter, summer: 'cotton' })).status).toBe(200);
    }
    for (const summer of ['cotton', 'rice', 'maize']) {
      expect((await putRotation(G1, { winter: 'wheat', summer })).status).toBe(200);
    }
  });

  test('one crop is enough: the other season is saved as fallow', async () => {
    await setCenter(G1);
    let res = await putRotation(G1, { winter: 'wheat' });
    expect(res.status).toBe(200);
    expect(res.body.rotationInput).toEqual({ winter: 'wheat', summer: 'fallow' });

    res = await putRotation(G1, { summer: 'rice' });
    expect(res.status).toBe(200);
    expect(res.body.rotationInput).toEqual({ winter: 'fallow', summer: 'rice' });
  });

  test('an empty string or null counts as fallow', async () => {
    await setCenter(G1);
    let res = await putRotation(G1, { winter: 'wheat', summer: '' });
    expect(res.body.rotationInput).toEqual({ winter: 'wheat', summer: 'fallow' });

    res = await putRotation(G1, { winter: null, summer: 'maize' });
    expect(res.body.rotationInput).toEqual({ winter: 'fallow', summer: 'maize' });
  });
});

describe('PUT /farm/rotation: both seasons empty', () => {
  test.each([
    ['empty body', {}],
    ['empty winter only', { winter: '' }],
    ['both empty strings', { winter: '', summer: '' }],
    ['both null', { winter: null, summer: null }],
    ['both fallow', { winter: 'fallow', summer: 'fallow' }],
  ])('%s gives 400 ROTATION_LAB_NEEDS_A_CROP', async (name, body) => {
    await setCenter(G1);
    const res = await putRotation(G1, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('ROTATION_LAB_NEEDS_A_CROP');
    expect(res.body.error.message.length).toBeGreaterThan(0);
  });

  test('a rejected save keeps the previous rotation', async () => {
    await setCenter(G1);
    await putRotation(G1, { winter: 'wheat', summer: 'maize' });
    const res = await putRotation(G1, {});
    expect(res.status).toBe(400);
    const farm = await getFarm(G1);
    expect(farm.body.rotationInput).toEqual({ winter: 'wheat', summer: 'maize' });
  });
});

describe('PUT /farm/rotation: invalid input', () => {
  test.each([
    ['a summer crop in winter', { winter: 'maize' }],
    ['a winter crop in summer', { summer: 'wheat' }],
    ['an old US crop', { winter: 'winter-wheat' }],
    ['an unknown crop', { winter: 'banana', summer: 'maize' }],
    ['a number', { winter: 5, summer: 'maize' }],
    ['an unknown key', { winter: 'wheat', spring: 'maize' }],
    ['a $ key', { winter: 'wheat', $ne: 1 }],
    ['a key with a dot', { winter: 'wheat', 'a.b': 1 }],
  ])('%s gives 400 VALIDATION_ERROR', async (name, body) => {
    await setCenter(G1);
    const res = await putRotation(G1, body);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('rotation and the rest of the farm', () => {
  test('PUT /farm does not wipe a saved rotation', async () => {
    await setCenter(G1);
    await putRotation(G1, { winter: 'wheat', summer: 'maize' });
    const res = await request(app).put('/api/farm').set(asGuest(G1)).send(FORM);
    expect(res.status).toBe(200);
    expect(res.body.rotationInput).toEqual({ winter: 'wheat', summer: 'maize' });
  });

  test('PATCH /farm cannot write the rotation', async () => {
    await setCenter(G1);
    const res = await request(app)
      .patch('/api/farm')
      .set(asGuest(G1))
      .send({ rotationInput: { winter: 'wheat', summer: 'maize' } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('saving a rotation does not change a complete farm status', async () => {
    await setCenter(G1);
    await request(app).put('/api/farm').set(asGuest(G1)).send(FORM);
    const res = await putRotation(G1, { winter: 'wheat', summer: 'maize' });
    expect(res.body.setupStatus).toBe('complete');
  });

  test('changing the rotation does not touch an existing active plan', async () => {
    await setCenter(G1);
    await putRotation(G1, { winter: 'wheat', summer: 'maize' });
    await request(app).post('/api/plans/choose').set(asGuest(G1)).send({ planKey: 'current' });

    await putRotation(G1, { winter: 'berseem', summer: 'rice' });

    const active = await request(app).get('/api/plans/active').set(asGuest(G1));
    expect(active.body.activePlan.input).toEqual({ center: 'desouk', winter: 'wheat', summer: 'maize' });
    expect(await ActivePlan.countDocuments({ archivedAt: null })).toBe(1);
  });

  test('two guests never share a rotation', async () => {
    await setCenter(G1);
    await putRotation(G1, { winter: 'wheat', summer: 'maize' });
    const other = await getFarm(G2);
    expect(other.body.rotationInput).toEqual({ winter: null, summer: null });
  });
});

describe('two seasons only', () => {
  test('seasonsPerYear 3 is rejected', async () => {
    await setCenter(G1);
    const res = await request(app)
      .put('/api/farm')
      .set(asGuest(G1))
      .send({ ...FORM, seasonsPerYear: 3 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('seasonsPerYear 1 and 2 are accepted', async () => {
    await setCenter(G1);
    for (const seasonsPerYear of [1, 2]) {
      const res = await request(app)
        .put('/api/farm')
        .set(asGuest(G1))
        .send({ ...FORM, seasonsPerYear });
      expect(res.status).toBe(200);
    }
  });
});

describe('the whole Phase 2 flow: area -> farm -> rotation -> plan', () => {
  test('the farmer saves a rotation, chooses a plan and then replaces it', async () => {
    // 1. the area
    await setCenter(G1);
    // 2. the farm form
    const farm = await request(app).put('/api/farm').set(asGuest(G1)).send(FORM);
    expect(farm.body.setupStatus).toBe('complete');
    expect(farm.body.rotationInput).toEqual({ winter: null, summer: null });

    // 3. the rotation of the Rotation Lab
    const rotation = await putRotation(G1, { winter: 'wheat', summer: 'maize' });
    expect(rotation.status).toBe(200);
    expect(rotation.body.rotationInput).toEqual({ winter: 'wheat', summer: 'maize' });

    // 4. choosing a plan (the plan of the farmer's own rotation)
    const chosen = await request(app)
      .post('/api/plans/choose')
      .set(asGuest(G1))
      .send({ planKey: 'current' });
    expect(chosen.status).toBe(201);
    expect(chosen.body.key).toBe('desouk|wheat|maize');
    expect(chosen.body.input).toEqual({ center: 'desouk', winter: 'wheat', summer: 'maize' });

    // 5. the active plan is the one that was chosen
    const active = await request(app).get('/api/plans/active').set(asGuest(G1));
    expect(active.body.activePlan.id).toBe(chosen.body.id);
    expect(active.body.activePlan.plan.plan_type).toBe('current');
    expect(await ActivePlan.countDocuments({ archivedAt: null })).toBe(1);

    // 6. choosing again archives the first one
    const second = await request(app)
      .post('/api/plans/choose')
      .set(asGuest(G1))
      .send({ planKey: 'soil_health' });
    expect(second.status).toBe(201);
    expect(second.body.planKey).toBe('soil_health');
    expect(await ActivePlan.countDocuments({ archivedAt: null })).toBe(1);
    expect(await ActivePlan.countDocuments({ archivedAt: { $ne: null } })).toBe(1);
    const archived = await ActivePlan.findById(chosen.body.id).lean();
    expect(archived.archivedAt).toBeInstanceOf(Date);
  });

  test('a farmer without a saved rotation cannot choose a plan', async () => {
    await setCenter(G1);
    const res = await request(app)
      .post('/api/plans/choose')
      .set(asGuest(G1))
      .send({ planKey: 'current' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ROTATION_NOT_SET');
    expect(await ActivePlan.countDocuments()).toBe(0);
  });
});