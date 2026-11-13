import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { Router } from 'express';

let mongod;
let User;
let Farm;
let ActivePlan;
let createApp;
let farmRoutes;
let plansRoutes;
let dashboardRoutes;
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
  ({ default: User } = await import('../../src/models/User.js'));
  ({ default: Farm } = await import('../../src/models/Farm.js'));
  ({ default: ActivePlan } = await import('../../src/models/ActivePlan.js'));
  ({ createApp } = await import('../../src/app.js'));
  ({ default: farmRoutes } = await import('../../src/routes/farmRoutes.js'));
  ({ default: plansRoutes } = await import('../../src/routes/plansRoutes.js'));
  ({ default: dashboardRoutes } = await import('../../src/routes/dashboardRoutes.js'));
  await User.init();
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
  router.use('/', dashboardRoutes);
  app = createApp({ apiRouter: router, rateLimit: { limit: 100000 } });
});

afterEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

const G1 = '3f2b8a52-6c1e-4b7d-9a35-0d4f7e1c2b90';
const G2 = '9d1c4e77-2a0b-4f63-8e15-7b3a6c5d8e21';
const asGuest = (id) => ({ 'X-Guest-Id': id });

const setCenter = (id, centerId = 'desouk') =>
  request(app).put('/api/farm/center').set(asGuest(id)).send({ centerId });
const putFarm = (id, body) => request(app).put('/api/farm').set(asGuest(id)).send(body);
const putRotation = (id, body) => request(app).put('/api/farm/rotation').set(asGuest(id)).send(body);
const journey = (id) => request(app).get('/api/journey').set(asGuest(id));

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

describe('GET /api/journey', () => {
  test('a visitor without an area is on the first step', async () => {
    const res = await journey(G1);
    expect(res.status).toBe(200);
    expect(res.body.current).toBe('explore');
    expect(res.body.nextRoute).toBe('/explore');
    expect(res.body.steps.map((s) => s.status)).toEqual([
      'current',
      'upcoming',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
  });

  test('an area without a complete farm setup is on the farm step', async () => {
    await setCenter(G1);
    const res = await journey(G1);
    expect(res.status).toBe(200);
    expect(res.body.current).toBe('farm');
    expect(res.body.nextRoute).toBe('/farm');
  });

  test('a complete farm with a saved rotation and no plan is on compare', async () => {
    await setCenter(G1);
    await putFarm(G1, FORM);
    await putRotation(G1, { winter: 'wheat', summer: 'maize' });

    const res = await journey(G1);
    expect(res.status).toBe(200);
    const statuses = Object.fromEntries(res.body.steps.map((s) => [s.id, s.status]));
    expect(statuses).toEqual({
      explore: 'done',
      farm: 'done',
      lab: 'done',
      compare: 'current',
      dashboard: 'upcoming',
    });
    expect(res.body.current).toBe('compare');
    expect(res.body.nextRoute).toBe('/compare-plans');
  });

  test('a complete farm with a saved rotation and a chosen plan is done', async () => {
    await setCenter(G1);
    await putFarm(G1, FORM);
    await putRotation(G1, { winter: 'wheat', summer: 'maize' });
    const chosen = await request(app)
      .post('/api/plans/choose')
      .set(asGuest(G1))
      .send({ planKey: 'current', startDate: '2026-11-15' });
    expect(chosen.status).toBe(201);

    const res = await journey(G1);
    expect(res.status).toBe(200);
    const statuses = Object.fromEntries(res.body.steps.map((s) => [s.id, s.status]));
    expect(statuses).toEqual({
      explore: 'done',
      farm: 'done',
      lab: 'done',
      compare: 'done',
      dashboard: 'done',
    });
    expect(res.body.current).toBe('dashboard');
    expect(res.body.nextRoute).toBe('/dashboard');
  });

  test('the last step is never locked while no plan was chosen', async () => {
    // a fresh visitor: the dashboard step stays upcoming because no plan exists yet
    const res = await journey(G2);
    expect(res.body.steps[4]).toEqual({
      id: 'dashboard',
      label: 'Your Dashboard',
      route: '/dashboard',
      status: 'upcoming',
    });
  });
});
