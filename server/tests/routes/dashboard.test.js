import path from 'node:path';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { Router } from 'express';

let mongod;
let Crop;
let PlanSet;
let ActivePlan;
let createApp;
let farmRoutes;
let rotationRoutes;
let plansRoutes;
let dashboardRoutes;
let initLayerData;
let resetLayerData;
let layerService;
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
  ({ default: Crop } = await import('../../src/models/Crop.js'));
  ({ default: PlanSet } = await import('../../src/models/PlanSet.js'));
  ({ default: ActivePlan } = await import('../../src/models/ActivePlan.js'));
  ({ createApp } = await import('../../src/app.js'));
  ({ default: farmRoutes } = await import('../../src/routes/farmRoutes.js'));
  ({ default: rotationRoutes } = await import('../../src/routes/rotationRoutes.js'));
  ({ default: plansRoutes } = await import('../../src/routes/plansRoutes.js'));
  ({ default: dashboardRoutes } = await import('../../src/routes/dashboardRoutes.js'));
  ({ initLayerData, resetLayerData } = await import('../../src/data/loadLayerData.js'));
  layerService = await import('../../src/services/layerService.js');
  initLayerData(path.resolve('src/data/layers'));
  await Promise.all([Crop.init(), PlanSet.init(), ActivePlan.init()]);
}, 60000);

afterAll(async () => {
  resetLayerData();
  await mongoose.disconnect();
  await mongod.stop();
});

function makeCrop(id, name, slots, selectableAsCurrent, attributes) {
  return {
    id,
    name,
    category: 'cash_crop',
    roleTag: 'Test',
    description: `About ${name}`,
    slots,
    selectableAsCurrent,
    image: { file: `${id}.webp`, thumbFile: `${id}.webp`, alt: `${name} in a field` },
    attributes,
  };
}

beforeEach(async () => {
  const router = Router();
  router.use('/farm', farmRoutes);
  router.use('/rotation', rotationRoutes);
  router.use('/plans', plansRoutes);
  router.use('/', dashboardRoutes);
  app = createApp({ apiRouter: router });

  await Crop.create([
    makeCrop('winter-rye', 'Winter Rye', ['fall_winter'], false,
      { family: 'grass', isLegume: false, waterNeed: 'low', groundCover: 'high', costLevel: 'low', equipment: ['seed_drill_planter'], typicalDays: 150 }),
    makeCrop('crimson-clover', 'Crimson Clover', ['spring'], false,
      { family: 'legume', isLegume: true, waterNeed: 'low', groundCover: 'high', costLevel: 'low', equipment: ['seed_drill_planter'], typicalDays: 90 }),
    makeCrop('field-corn', 'Field Corn', ['spring', 'summer_fall'], true,
      { family: 'grass', isLegume: false, waterNeed: 'high', groundCover: 'medium', costLevel: 'high', equipment: ['standard_tractor', 'seed_drill_planter', 'combine_harvester'], typicalDays: 120 }),
    makeCrop('soybeans', 'Soybeans', ['spring', 'summer_fall'], true,
      { family: 'legume', isLegume: true, waterNeed: 'medium', groundCover: 'medium', costLevel: 'medium', equipment: ['standard_tractor', 'seed_drill_planter', 'combine_harvester'], typicalDays: 110 }),
    makeCrop('daikon', 'Daikon', ['fall_winter'], false,
      { family: 'brassica', isLegume: false, waterNeed: 'low', groundCover: 'high', costLevel: 'low', equipment: ['seed_drill_planter'], typicalDays: 70 }),
    makeCrop('field-peas', 'Field Peas', ['spring'], false,
      { family: 'legume', isLegume: true, waterNeed: 'low', groundCover: 'medium', costLevel: 'low', equipment: ['seed_drill_planter', 'combine_harvester'], typicalDays: 90 }),
    makeCrop('grain-sorghum', 'Grain Sorghum', ['summer_fall'], true,
      { family: 'grass', isLegume: false, waterNeed: 'low', groundCover: 'medium', costLevel: 'low', equipment: ['standard_tractor', 'seed_drill_planter', 'combine_harvester'], typicalDays: 110 }),
  ]);
});

afterEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

const G1 = '3f2b8a52-6c1e-4b7d-9a35-0d4f7e1c2b90';
const G2 = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const asGuest = (id) => ({ 'X-Guest-Id': id });

const FORM = {
  currentCrops: ['field-corn'],
  waterSource: 'rain',
  waterSourceOther: null,
  waterAvailability: 'usually_enough',
  soilType: 'loamy',
  equipment: [],
  seasonsPerYear: 2,
  priorities: ['save_water'],
};

const setCenter = (id) => request(app).put('/api/farm/center').set(asGuest(id)).send({ centerId: 'desouk' });
const completeFarm = async (id) => {
  await setCenter(id);
  return request(app).put('/api/farm').set(asGuest(id)).send(FORM);
};
const MINE = [
  { slot: 'fall_winter', cropId: 'winter-rye' },
  { slot: 'spring', cropId: 'crimson-clover' },
  { slot: 'summer_fall', cropId: 'soybeans' },
];
const saveDraft = (id) => request(app).post('/api/rotation/score').set(asGuest(id)).send({ sequence: MINE });
const compare = (id) => request(app).post('/api/plans/compare').set(asGuest(id));
const choose = (id, body) => request(app).post('/api/plans/choose').set(asGuest(id)).send(body);
const dashboard = (id) => request(app).get('/api/dashboard').set(asGuest(id));
const report = (id) => request(app).get('/api/reports/summary').set(asGuest(id));
const journey = (id) => request(app).get('/api/journey').set(asGuest(id));
const isoDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

// Complete farm, compare, choose area_plan_a (winter-rye 150 days, crimson-clover 90, field-corn 120).
async function chooseAreaPlanA(id, startDate) {
  await completeFarm(id);
  const { body } = await compare(id);
  return choose(id, { planSetId: body.planSetId, planKey: 'area_plan_a', ...(startDate ? { startDate } : {}) });
}

const statuses = (res) => res.body.steps.map((s) => s.status);

describe('access', () => {
  test('no token and no guest id gives 401 on all three routes', async () => {
    for (const url of ['/api/dashboard', '/api/reports/summary', '/api/journey']) {
      expect((await request(app).get(url)).status).toBe(401);
    }
  });

  test('a malformed guest id gives 400 INVALID_GUEST_ID', async () => {
    const res = await request(app).get('/api/journey').set(asGuest('1234'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_GUEST_ID');
  });

  test('the answers are never cached', async () => {
    expect((await journey(G1)).headers['cache-control']).toBe('no-store');
    expect((await dashboard(G1)).headers['cache-control']).toBe('no-store');
  });
});

describe('GET /journey', () => {
  test('a new visitor starts at explore', async () => {
    const res = await journey(G1);
    expect(res.status).toBe(200);
    expect(res.body.steps.map((s) => s.id)).toEqual(['explore', 'farm', 'lab', 'compare', 'dashboard']);
    expect(statuses(res)).toEqual(['current', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
    expect(res.body.current).toBe('explore');
    expect(res.body.nextRoute).toBe('/explore');
    expect(Object.keys(res.body.steps[0]).sort()).toEqual(['id', 'label', 'route', 'status']);
  });

  test('moves forward step by step', async () => {
    await setCenter(G1);
    let res = await journey(G1);
    expect(statuses(res)).toEqual(['done', 'current', 'upcoming', 'upcoming', 'upcoming']);
    expect(res.body.nextRoute).toBe('/farm');

    await completeFarm(G1);
    res = await journey(G1);
    expect(statuses(res)).toEqual(['done', 'done', 'current', 'upcoming', 'upcoming']);
    expect(res.body.current).toBe('lab');
    expect(res.body.nextRoute).toBe('/rotation-lab');

    await saveDraft(G1);
    res = await journey(G1);
    expect(statuses(res)).toEqual(['done', 'done', 'done', 'current', 'upcoming']);
    expect(res.body.nextRoute).toBe('/compare-plans');

    const { body } = await compare(G1);
    await choose(G1, { planSetId: body.planSetId, planKey: 'my_plan' });
    res = await journey(G1);
    expect(statuses(res)).toEqual(['done', 'done', 'done', 'done', 'current']);
    expect(res.body.current).toBe('dashboard');
    expect(res.body.nextRoute).toBe('/dashboard');
  });

  test('skipping the Lab still counts it as done once a plan is chosen', async () => {
    await chooseAreaPlanA(G2);
    const res = await journey(G2);
    expect(statuses(res)).toEqual(['done', 'done', 'done', 'done', 'current']);
  });
});

describe('GET /dashboard', () => {
  test('a visitor with no area: empty header, no land, no plan', async () => {
    const res = await dashboard(G1);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'hasActivePlan', 'header', 'land', 'plan', 'protection', 'reportsAvailable', 'seasonProgress', 'waterBySeason',
    ]);
    expect(res.body.header).toEqual({ farmName: null, centerId: null, centerName: null, locationLabel: null });
    expect(res.body.land).toBeNull();
    expect(res.body.reportsAvailable).toBe(false);
    expect(res.body.hasActivePlan).toBe(false);
  });

  test('an area but no plan: header, land pieces, plan parts null', async () => {
    await setCenter(G1);
    await request(app).patch('/api/farm').set(asGuest(G1)).send({ farmName: 'Green Acres' });
    const res = await dashboard(G1);
    expect(res.body.header).toEqual({
      farmName: 'Green Acres',
      centerId: 'desouk',
      centerName: 'Desouk',
      locationLabel: 'Desouk · Kafr El-Sheikh',
    });
    expect(Object.keys(res.body.land).sort()).toEqual(['areaWarning', 'dataThrough', 'landRisk', 'soilMoisture', 'tiles']);
    expect(res.body.land.tiles).toHaveLength(4);
    expect(res.body.land.landRisk.indicators).toHaveLength(4);
    expect(res.body.reportsAvailable).toBe(true);
    expect(res.body.hasActivePlan).toBe(false);
    for (const key of ['seasonProgress', 'protection', 'waterBySeason', 'plan']) expect(res.body[key]).toBeNull();
  });

  test('with a plan that starts today: day 1 of the first season', async () => {
    const chosen = await chooseAreaPlanA(G1);
    const res = await dashboard(G1);
    expect(res.body.hasActivePlan).toBe(true);
    expect(res.body.seasonProgress).toEqual({
      state: 'in_progress',
      currentSlot: 'fall_winter',
      seasonLabel: 'Season 1 · Fall / Winter',
      crop: { id: 'winter-rye', name: 'Winter Rye' },
      dayOfSeason: 1,
      totalDays: 150,
      percent: 1,
      isEstimate: true,
    });
    expect(res.body.plan.id).toBe(chosen.body.id);
    expect(res.body.plan.sequence.map((s) => s.state)).toEqual(['in_progress', 'upcoming_next', 'scheduled']);
  });

  test('protection and water by season use the plan season details', async () => {
    await chooseAreaPlanA(G1);
    const { protection, waterBySeason } = (await dashboard(G1)).body;
    const labels = ['S1: Winter Rye (Fall / Winter)', 'S2: Crimson Clover (Spring)', 'S3: Field Corn (Summer / Fall)'];
    expect(protection.seasons.map((s) => s.label)).toEqual(labels);
    expect(protection.seasons.map((s) => s.value)).toEqual([90, 90, 60]);
    expect(protection.seasons.map((s) => s.slot)).toEqual(['fall_winter', 'spring', 'summer_fall']);
    expect(Object.keys(protection.seasons[0]).sort()).toEqual(['cropId', 'label', 'meterLabel', 'note', 'slot', 'value']);
    expect(protection.overall).toMatchObject({ value: 79, level: 'high', levelLabel: 'HIGH', fitLabel: 'Good Fit' });
    expect(waterBySeason.seasons.map((s) => s.label)).toEqual(labels);
    expect(waterBySeason.seasons.map((s) => s.value)).toEqual([25, 25, 85]);
  });

  test('a start date in the future: not started, first season is upcoming', async () => {
    await chooseAreaPlanA(G1, isoDay(10));
    const { seasonProgress, plan } = (await dashboard(G1)).body;
    expect(seasonProgress).toMatchObject({ state: 'not_started', currentSlot: 'fall_winter', dayOfSeason: 0, percent: 0 });
    expect(plan.sequence.map((s) => s.state)).toEqual(['upcoming_next', 'scheduled', 'scheduled']);
  });

  test('160 days in: walks past season 1 into day 11 of season 2', async () => {
    await chooseAreaPlanA(G1, isoDay(-160));
    const { seasonProgress, plan } = (await dashboard(G1)).body;
    expect(seasonProgress).toMatchObject({
      state: 'in_progress',
      currentSlot: 'spring',
      crop: { id: 'crimson-clover', name: 'Crimson Clover' },
      dayOfSeason: 11,
      totalDays: 90,
      percent: 12,
    });
    expect(plan.sequence.map((s) => s.state)).toEqual(['done', 'in_progress', 'upcoming_next']);
  });

  test('after all seasons: completed, 100 percent', async () => {
    await chooseAreaPlanA(G1, isoDay(-400)); // 150 + 90 + 120 = 360 days
    const { seasonProgress, plan } = (await dashboard(G1)).body;
    expect(seasonProgress).toMatchObject({ state: 'completed', currentSlot: 'summer_fall', percent: 100, isEstimate: true });
    expect(plan.sequence.map((s) => s.state)).toEqual(['done', 'done', 'done']);
  });

  test('a crop removed from the catalog is skipped, not an error', async () => {
    await chooseAreaPlanA(G1);
    await Crop.deleteOne({ id: 'crimson-clover' });
    const res = await dashboard(G1);
    expect(res.status).toBe(200);
    expect(res.body.protection.seasons.map((s) => s.label)).toEqual([
      'S1: Winter Rye (Fall / Winter)',
      'S3: Field Corn (Summer / Fall)',
    ]);
    expect(res.body.seasonProgress.crop.id).toBe('winter-rye');
  });

  test("one visitor never sees another visitor's plan", async () => {
    await chooseAreaPlanA(G1);
    await completeFarm(G2);
    expect((await dashboard(G2)).body.hasActivePlan).toBe(false);
  });
});

describe('GET /reports/summary', () => {
  test('without an area it gives 409 FARM_SETUP_INCOMPLETE', async () => {
    const res = await report(G1);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('FARM_SETUP_INCOMPLETE');
  });

  test('with an area but no plan: copied report texts, farm and limits', async () => {
    await setCenter(G1);
    const res = await report(G1);
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual([
      'activePlan', 'center', 'disclaimer', 'farm', 'generatedAt', 'landRiskReport', 'limits', 'soilMoistureReport',
    ]);
    expect(res.body.center).toEqual({ id: 'desouk', name: 'Desouk', governorate: 'Kafr El-Sheikh' });
    expect(res.body.farm.centerId).toBe('desouk');
    expect(res.body.activePlan).toBeNull();
    expect(Object.keys(res.body.soilMoistureReport).sort()).toEqual(['may_mean', 'observed', 'to_verify']);
    expect(res.body.landRiskReport).toHaveProperty('observed');
    expect(res.body.landRiskReport).toHaveProperty('meaning');
    expect(res.body.landRiskReport).toHaveProperty('verify');
    expect(res.body.landRiskReport).toHaveProperty('confidence');
    expect(res.body.limits.length).toBeGreaterThan(0);
    expect(res.body.disclaimer.length).toBeGreaterThan(0);
  });

  test('the texts are exact copies of the layer data', async () => {
    await setCenter(G1);
    const { body } = await report(G1);
    const soil = layerService.getSoilMoisture('desouk');
    const heat = layerService.getHeatStress('desouk');
    expect(body.soilMoistureReport).toEqual(soil.texts.report);
    expect(body.landRiskReport).toEqual(layerService.getLandRisk('desouk').point.report);
    expect(body.limits).toEqual([...soil.limits, ...heat.limits]);
    expect(body.disclaimer).toBe(soil.footer);
  });

  test('includes the active plan when there is one', async () => {
    const chosen = await chooseAreaPlanA(G1);
    const { body } = await report(G1);
    expect(body.activePlan.id).toBe(chosen.body.id);
    expect(body.activePlan.planKey).toBe('area_plan_a');
    expect(body.farm.setupStatus).toBe('complete');
  });
});