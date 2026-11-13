import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { Router } from 'express';
import { initLayerData, resetLayerData } from '../../src/data/loadLayerData.js';

let mongod;
let User;
let Farm;
let ActivePlan;
let createApp;
let farmRoutes;
let plansRoutes;
let dashboardRoutes;
let app;
let getRotationLabData;

const LAYER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/data/layers');

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
  ({ getRotationLabData } = await import('../../src/data/loadRotationLabData.js'));
  initLayerData(LAYER_DIR);
  await User.init();
  await Farm.init();
  await ActivePlan.init(); // builds the unique "one active plan per user" index
}, 60000);

afterAll(async () => {
  resetLayerData();
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
const putRotation = (id, body) => request(app).put('/api/farm/rotation').set(asGuest(id)).send(body);
const putFarm = (id, body) => request(app).put('/api/farm').set(asGuest(id)).send(body);
const choose = (id, body) => request(app).post('/api/plans/choose').set(asGuest(id)).send(body);
const dashboard = (id) => request(app).get('/api/dashboard').set(asGuest(id));
const report = (id) => request(app).get('/api/reports/summary').set(asGuest(id));

const ROTATION = { winter: 'wheat', summer: 'maize' };
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

const prepare = async (id, rotation = ROTATION, centerId = 'desouk') => {
  await setCenter(id, centerId);
  return putRotation(id, rotation);
};

const stored = (key, type) => getRotationLabData().plansByKey.get(key).plans[type];
const isoDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

describe('GET /api/dashboard: access', () => {
  test('no token and no guest id gives 401', async () => {
    expect((await request(app).get('/api/dashboard')).status).toBe(401);
  });

  test('a malformed guest id gives 400 INVALID_GUEST_ID', async () => {
    const res = await request(app).get('/api/dashboard').set(asGuest('1234'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_GUEST_ID');
  });

  test('the dashboard is never cached', async () => {
    const res = await dashboard(G1);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('GET /api/dashboard: no center, no plan', () => {
  test('a visitor without an area gets land null, reportsAvailable false and all plan fields null', async () => {
    const res = await dashboard(G1);
    expect(res.status).toBe(200);
    expect(res.body.header).toEqual({
      farmName: null,
      centerId: null,
      centerName: null,
      locationLabel: null,
    });
    expect(res.body.land).toBeNull();
    expect(res.body.hasActivePlan).toBe(false);
    expect(res.body.seasonProgress).toBeNull();
    expect(res.body.protection).toBeNull();
    expect(res.body.waterBySeason).toBeNull();
    expect(res.body.plan).toBeNull();
    expect(res.body.reportsAvailable).toBe(false);
  });

  test('a center with no chosen plan still returns the land and nulls the plan fields', async () => {
    await setCenter(G1);
    const res = await dashboard(G1);
    expect(res.status).toBe(200);
    expect(res.body.land).not.toBeNull();
    expect(res.body.hasActivePlan).toBe(false);
    expect(res.body.seasonProgress).toBeNull();
    expect(res.body.protection).toBeNull();
    expect(res.body.waterBySeason).toBeNull();
    expect(res.body.plan).toBeNull();
    expect(res.body.reportsAvailable).toBe(true);
  });
});

describe('GET /api/dashboard: with the saved rotation and the chosen plan', () => {
  test('the plan fields come from the chosen ActivePlan and the season progress from the saved rotation', async () => {
    await prepare(G1);
    const chosen = await choose(G1, { planKey: 'current', startDate: isoDay(0) });
    expect(chosen.status).toBe(201);

    const res = await dashboard(G1);
    expect(res.status).toBe(200);
    expect(res.body.hasActivePlan).toBe(true);
    expect(res.body.reportsAvailable).toBe(true);
    expect(res.body.plan).toEqual(chosen.body);
    expect(res.body.plan.planKey).toBe('current');
    expect(res.body.plan.plan.plan_type).toBe('current');

    // season progress: winter wheat (180 days) started today -> day 1 of the season
    expect(res.body.seasonProgress).toEqual({
      state: 'in_progress',
      currentSlot: 'winter',
      currentCropName: 'Wheat',
      dayOfSeason: 1,
      totalDays: 180,
      percent: 1,
      isEstimate: true,
    });
  });

  test('protection and water needs are built from the chosen plan content', async () => {
    await prepare(G1, { winter: 'wheat', summer: 'maize' });
    const chosen = await choose(G1, { planKey: 'current', startDate: isoDay(0) });
    const res = await dashboard(G1);

    expect(res.body.protection).toEqual({
      title: 'Soil & Ground Cover Resilience',
      seasons: [
        {
          slot: 'winter',
          seasonLabel: 'S1: Wheat (Winter)',
          label: 'Wheat Cover Canopy',
          value: null,
          note: 'Days with no crop: 116',
        },
        {
          slot: 'summer',
          seasonLabel: 'S2: Maize (Summer)',
          label: 'Maize Cover Canopy',
          value: null,
          note: 'Days with no crop: 116',
        },
      ],
      overall: { level: 'low', fitLabel: 'Needs Checking' },
    });

    expect(res.body.waterBySeason).toEqual({
      title: 'Water Needs by Season',
      seasons: [
        { slot: 'winter', seasonLabel: 'S1: Wheat (Winter)', value: 547, label: 'Moderate evaporative demand' },
        { slot: 'summer', seasonLabel: 'S2: Maize (Summer)', value: 716, label: 'Moderate evaporative demand' },
      ],
    });
  });

  test('a soil_health plan gives the soil health level of its own content', async () => {
    await prepare(G1, { winter: 'wheat', summer: 'maize' });
    const chosen = await choose(G1, { planKey: 'soil_health', startDate: isoDay(0) });
    const res = await dashboard(G1);

    expect(res.body.plan).toEqual(chosen.body);
    expect(res.body.protection.overall).toEqual({ level: 'high', fitLabel: 'Good Fit' });
    expect(res.body.protection.seasons).toHaveLength(2);
    expect(res.body.protection.seasons[0].note).toBe('Days with no crop: 16');
    expect(res.body.waterBySeason.seasons).toHaveLength(2);
  });
});

describe('GET /api/dashboard: season progress', () => {
  test('a future start date gives not_started', async () => {
    await prepare(G1);
    const chosen = await choose(G1, { planKey: 'current', startDate: isoDay(5) });
    const res = await dashboard(G1);
    expect(res.body.seasonProgress).toEqual({
      state: 'not_started',
      currentSlot: 'winter',
      currentCropName: 'Wheat',
      dayOfSeason: 0,
      totalDays: 180,
      percent: 0,
      isEstimate: true,
    });
    expect(res.body.plan).toEqual(chosen.body);
  });

  test('an elapsed winter gives the day of season inside the winter crop', async () => {
    await prepare(G1);
    const chosen = await choose(G1, { planKey: 'current', startDate: isoDay(-40) });
    const res = await dashboard(G1);
    expect(res.body.seasonProgress).toEqual({
      state: 'in_progress',
      currentSlot: 'winter',
      currentCropName: 'Wheat',
      dayOfSeason: 41,
      totalDays: 180,
      percent: 23,
      isEstimate: true,
    });
  });

  test('a rotation longer than the elapsed time is completed', async () => {
    await prepare(G1);
    const chosen = await choose(G1, { planKey: 'current', startDate: isoDay(-400) });
    const res = await dashboard(G1);
    expect(res.body.seasonProgress).toEqual({
      state: 'completed',
      currentSlot: 'summer',
      currentCropName: 'Maize',
      dayOfSeason: 130,
      totalDays: 130,
      percent: 100,
      isEstimate: true,
    });
  });

  test('a fallow season is skipped and the progress runs with the next crop', async () => {
    await prepare(G1, { winter: 'fallow', summer: 'cotton' });
    const chosen = await choose(G1, { planKey: 'water_saving', startDate: isoDay(0) });
    const res = await dashboard(G1);
    expect(res.body.seasonProgress).toEqual({
      state: 'in_progress',
      currentSlot: 'summer',
      currentCropName: 'Cotton',
      dayOfSeason: 1,
      totalDays: 195,
      percent: 1,
      isEstimate: true,
    });
    expect(res.body.plan).toEqual(chosen.body);
  });
});

describe('GET /api/reports/summary', () => {
  test('without an area it gives 409 FARM_SETUP_INCOMPLETE', async () => {
    const res = await report(G1);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('FARM_SETUP_INCOMPLETE');
  });

  test('with a chosen plan it returns the new ActivePlan content under the plan key', async () => {
    await prepare(G1);
    const chosen = await choose(G1, { planKey: 'current', startDate: isoDay(0) });

    const res = await report(G1);
    expect(res.status).toBe(200);
    expect(res.body.plan).toEqual(chosen.body);
    expect(res.body).not.toHaveProperty('activePlan');
    expect(typeof res.body.generatedAt).toBe('string');
    expect(res.body.center).toEqual({
      id: 'desouk',
      name: 'Desouk',
      governorate: 'Kafr El-Sheikh',
    });
    expect(res.body.farm).not.toBeNull();
    expect(res.body.soilMoistureReport).toBeDefined();
    expect(res.body.landRiskReport).toBeDefined();
    expect(Array.isArray(res.body.limits)).toBe(true);
    expect(typeof res.body.disclaimer).toBe('string');
  });

  test('without a chosen plan the report has no plan', async () => {
    await setCenter(G1);
    const res = await report(G1);
    expect(res.status).toBe(200);
    expect(res.body.plan).toBeNull();
  });
});
