import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { Router } from 'express';

const BBOX = [30.55, 31.05, 30.75, 31.25];

let mongod;
let Farm;
let Crop;
let PlanSet;
let ActivePlan;
let createApp;
let farmRoutes;
let rotationRoutes;
let plansRoutes;
let mockScoringClient;
let AppError;
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

  // Must come before the imports below: no layer data files are needed in this test.
  jest.unstable_mockModule('../../src/services/centerGeometry.js', () => ({
    getCenterGeometry: async () => ({ name: 'Desouk', bbox: BBOX }),
  }));

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  ({ default: Farm } = await import('../../src/models/Farm.js'));
  ({ default: Crop } = await import('../../src/models/Crop.js'));
  ({ default: PlanSet } = await import('../../src/models/PlanSet.js'));
  ({ default: ActivePlan } = await import('../../src/models/ActivePlan.js'));
  ({ createApp } = await import('../../src/app.js'));
  ({ default: farmRoutes } = await import('../../src/routes/farmRoutes.js'));
  ({ default: rotationRoutes } = await import('../../src/routes/rotationRoutes.js'));
  ({ default: plansRoutes } = await import('../../src/routes/plansRoutes.js'));
  ({ mockScoringClient } = await import('../../src/services/scoring/mockScoringClient.js'));
  ({ AppError } = await import('../../src/utils/AppError.js'));
  await Farm.init();
  await Crop.init();
  await PlanSet.init();
  await ActivePlan.init(); // builds the unique "one active plan per user" index
}, 60000);

afterAll(async () => {
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
    calendar: { plantingLabel: 'Plant', harvestLabel: 'Harvest' },
    attributes,
  };
}

beforeEach(async () => {
  const router = Router();
  router.use('/farm', farmRoutes);
  router.use('/rotation', rotationRoutes);
  router.use('/plans', plansRoutes);
  app = createApp({ apiRouter: router });

  // Desouk's two fixed plans: winter-rye, crimson-clover, field-corn / daikon, field-peas, grain-sorghum.
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
  jest.restoreAllMocks();
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

const G1 = '3f2b8a52-6c1e-4b7d-9a35-0d4f7e1c2b90';
const G2 = '9d1c4e77-2a0b-4f63-8e15-7b3a6c5d8e21';
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

const completeFarm = async (id) => {
  await request(app).put('/api/farm/center').set(asGuest(id)).send({ centerId: 'desouk' });
  return request(app).put('/api/farm').set(asGuest(id)).send(FORM);
};

const SEQ = (a, b, c) => [
  { slot: 'fall_winter', cropId: a },
  { slot: 'spring', cropId: b },
  { slot: 'summer_fall', cropId: c },
];
const MINE = SEQ('winter-rye', 'crimson-clover', 'soybeans'); // water 82, soil 70, erosion 79, practicality 70, economy 65

const compare = (id, body) => {
  const req = request(app).post('/api/plans/compare').set(asGuest(id));
  return body === undefined ? req : req.send(body);
};
const choose = (id, body) => request(app).post('/api/plans/choose').set(asGuest(id)).send(body);
const active = (id) => request(app).get('/api/plans/active').set(asGuest(id));
const saveDraft = (id, sequence = MINE) =>
  request(app).post('/api/rotation/score').set(asGuest(id)).send({ sequence });

const byKey = (res, key) => res.body.plans.find((p) => p.planKey === key);
const ids = (plan) => plan.sequence.map((s) => s.crop.id);
const isoDay = (offsetDays = 0) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

describe('access and guard', () => {
  test('no token and no guest id gives 401 on all three routes', async () => {
    expect((await request(app).post('/api/plans/compare')).status).toBe(401);
    expect((await request(app).post('/api/plans/choose').send({})).status).toBe(401);
    expect((await request(app).get('/api/plans/active')).status).toBe(401);
  });

  test('a malformed guest id gives 400 INVALID_GUEST_ID', async () => {
    const res = await request(app).post('/api/plans/compare').set(asGuest('1234'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_GUEST_ID');
  });

  test('an incomplete farm gives 409 FARM_SETUP_INCOMPLETE', async () => {
    const res = await compare(G1);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('FARM_SETUP_INCOMPLETE');
  });
});

describe('POST /plans/compare without a rotation', () => {
  test('returns 3 plans in order my_plan, area_plan_a, area_plan_b (no body needed)', async () => {
    await completeFarm(G1);
    const res = await compare(G1);
    expect(res.status).toBe(200);
    expect(res.body.planSetId).toMatch(/^[0-9a-f]{24}$/);
    expect(res.body.status).toBe('placeholder');
    expect(res.body.goals).toEqual([{ id: 'save_water', label: 'Save Water' }]);
    expect(res.body.notices).toEqual(['Scores show how well a plan fits, not what your yield or profit will be.']);
    expect(res.body.plans.map((p) => [p.number, p.planKey])).toEqual([
      [1, 'my_plan'], [2, 'area_plan_a'], [3, 'area_plan_b'],
    ]);
  });

  test('an empty body and labSequence null behave the same', async () => {
    await completeFarm(G1);
    expect(byKey(await compare(G1, {}), 'my_plan').empty).toBe(true);
    expect(byKey(await compare(G1, { labSequence: null }), 'my_plan').empty).toBe(true);
  });

  test('plan 1 is the empty card (A31)', async () => {
    await completeFarm(G1);
    const mine = byKey(await compare(G1), 'my_plan');
    expect(mine).toMatchObject({
      planKey: 'my_plan',
      number: 1,
      empty: true,
      title: 'My Rotation',
      message: 'Build your own rotation in the Rotation Lab to compare it here.',
      recommended: false,
      rank: null,
      matchScore: null,
    });
    expect(mine.sequence).toBeUndefined();
  });

  test('the two area plans are the Desouk plans with titles, badges and slot details', async () => {
    await completeFarm(G1);
    const res = await compare(G1);
    const a = byKey(res, 'area_plan_a');
    const b = byKey(res, 'area_plan_b');
    expect(ids(a)).toEqual(['winter-rye', 'crimson-clover', 'field-corn']);
    expect(ids(b)).toEqual(['daikon', 'field-peas', 'grain-sorghum']);
    expect(a.title).toBe('Build the Soil');
    expect(a.badge).toEqual({ label: 'Soil Builder', tone: 'positive' });
    expect(b.title).toBe('Save Water & Balance Costs');
    expect(a.sequence.map((s) => s.slotLabel)).toEqual(['Fall / Winter', 'Spring', 'Summer / Fall']);
    expect(a.sequence.map((s) => s.seasonNumber)).toEqual(['S1', 'S2', 'S3']);
    expect(a.sequence.map((s) => s.roleTag)).toEqual(['Test', 'Test', 'Test']);
    expect(a.sequence[0].crop).toEqual({
      id: 'winter-rye',
      name: 'Winter Rye',
      image: { thumbUrl: 'https://api.test.local/static/crops/thumb/winter-rye.webp', alt: 'Winter Rye in a field' },
    });
  });

  test('each non-empty plan has exactly the contract fields', async () => {
    await completeFarm(G1);
    const plan = byKey(await compare(G1), 'area_plan_a');
    expect(Object.keys(plan).sort()).toEqual([
      'badge', 'dataConfidence', 'evidence', 'fit', 'infoGaps', 'mainBenefit', 'matchScore', 'number',
      'planKey', 'rank', 'recommended', 'recommendedLabel', 'risksToReview', 'seasonDetails',
      'sequence', 'title', 'watchOut',
    ]);
  });

  test('fit rows are in order with compare labels, values and fit labels', async () => {
    await completeFarm(G1);
    const { fit } = byKey(await compare(G1), 'area_plan_a');
    expect(fit.map((f) => f.metricId)).toEqual(['water', 'soil', 'erosion', 'practicality', 'economy']);
    expect(fit.map((f) => f.label)).toEqual(['Water Needs', 'Soil Health', 'Soil Protection', 'Fits Your Farm', 'Costs & Earnings']);
    expect(fit.map((f) => f.value)).toEqual([74, 95, 79, 70, 68]);
    expect(fit.map((f) => f.fitLabel)).toEqual(['Moderate Fit', 'Good Fit', 'Good Fit', 'Moderate Fit', 'Moderate Fit']);
    expect(fit.every((f) => typeof f.note === 'string' && f.note.length > 0)).toBe(true);
  });

  test('ranks the 2 area plans by the priorities: save_water recommends area_plan_b', async () => {
    await completeFarm(G1);
    const res = await compare(G1);
    expect(res.body.plans.map((p) => p.matchScore)).toEqual([null, 76, 83]);
    expect(res.body.plans.map((p) => p.rank)).toEqual([null, 2, 1]);
    expect(res.body.plans.map((p) => p.recommended)).toEqual([false, false, true]);
    expect(res.body.plans.map((p) => p.recommendedLabel)).toEqual([null, null, 'Recommended for Water Goals']);
  });

  test('changing the priorities changes the ranking (tie: lower plan number wins)', async () => {
    await completeFarm(G1);
    await request(app).patch('/api/farm').set(asGuest(G1)).send({ priorities: ['protect_land'] });
    const res = await compare(G1);
    expect(res.body.plans.map((p) => p.matchScore)).toEqual([null, 78, 78]);
    expect(res.body.plans.map((p) => p.rank)).toEqual([null, 1, 2]);
    expect(byKey(res, 'area_plan_a').recommendedLabel).toBe('Recommended for Land Protection');
  });

  test('saves a PlanSet with mySequence null and the 3 plans as returned', async () => {
    await completeFarm(G1);
    const res = await compare(G1);
    const saved = await PlanSet.findById(res.body.planSetId).lean();
    expect(saved.mySequence ?? null).toBeNull();
    expect(saved.plans.map((p) => p.planKey)).toEqual(['my_plan', 'area_plan_a', 'area_plan_b']);
    expect(saved.plans[2].matchScore).toBe(83);
    expect(saved.centerId).toBe('desouk');
    expect(JSON.stringify(saved.farmSnapshot)).not.toMatch(/userId|farmName/);
  });
});

describe('POST /plans/compare with the farmer’s own rotation', () => {
  test('uses the saved Lab draft as plan 1', async () => {
    await completeFarm(G1);
    await saveDraft(G1);
    const res = await compare(G1);
    const mine = byKey(res, 'my_plan');
    expect(mine.empty).toBeUndefined();
    expect(mine.number).toBe(1);
    expect(ids(mine)).toEqual(['winter-rye', 'crimson-clover', 'soybeans']);
    expect(mine.title).toBe('My Rotation');
    expect(mine.badge).toEqual({ label: 'Your Plan', tone: 'info' });
    expect(mine.fit.map((f) => f.value)).toEqual([82, 70, 79, 70, 65]);
    expect(mine.seasonDetails).toHaveLength(3);
    expect(Object.keys(mine).sort()).toEqual(Object.keys(byKey(res, 'area_plan_a')).sort());
  });

  test('plan 1 carries the plan block and notes of the same /rotation/score call', async () => {
    await completeFarm(G1);
    const scored = await saveDraft(G1);
    const mine = byKey(await compare(G1), 'my_plan');
    expect(mine.mainBenefit).toBe(scored.body.plan.mainBenefit);
    expect(mine.watchOut).toBe(scored.body.plan.watchOut);
    expect(mine.evidence).toEqual(scored.body.plan.evidence);
    expect(mine.infoGaps).toEqual(scored.body.plan.infoGaps);
    expect(mine.risksToReview).toEqual(scored.body.plan.risksToReview);
    expect(mine.fit.map((f) => f.note)).toEqual(scored.body.metrics.map((m) => m.text));
  });

  test('ranks all 3 plans together (a tie goes to the lower plan number)', async () => {
    await completeFarm(G1);
    await saveDraft(G1);
    const res = await compare(G1);
    expect(res.body.plans.map((p) => p.matchScore)).toEqual([76, 76, 83]);
    expect(res.body.plans.map((p) => p.rank)).toEqual([2, 3, 1]);
    expect(res.body.plans.map((p) => p.recommended)).toEqual([false, false, true]);
  });

  test('a labSequence in the body wins over the saved draft and is not saved as the draft', async () => {
    await completeFarm(G1);
    await saveDraft(G1, SEQ('winter-rye', 'crimson-clover', 'field-corn'));
    const res = await compare(G1, { labSequence: MINE });
    expect(ids(byKey(res, 'my_plan'))).toEqual(['winter-rye', 'crimson-clover', 'soybeans']);
    const saved = await PlanSet.findById(res.body.planSetId).lean();
    expect(saved.mySequence).toEqual(MINE);
    const farm = await Farm.findOne({}).lean();
    expect(farm.draftSequence.map((s) => s.cropId)).toEqual(['winter-rye', 'crimson-clover', 'field-corn']);
  });

  test('a labSequence works without any saved draft', async () => {
    await completeFarm(G1);
    const res = await compare(G1, { labSequence: MINE });
    expect(res.status).toBe(200);
    expect(ids(byKey(res, 'my_plan'))).toEqual(['winter-rye', 'crimson-clover', 'soybeans']);
    expect((await Farm.findOne({}).lean()).draftSequence).toEqual([]);
  });

  test('a saved draft whose crop was removed is ignored (plan 1 is empty)', async () => {
    await completeFarm(G1);
    await saveDraft(G1);
    await Crop.deleteOne({ id: 'soybeans' });
    const res = await compare(G1);
    expect(res.status).toBe(200);
    expect(byKey(res, 'my_plan').empty).toBe(true);
  });

  test('a bad labSequence gives 400, an unknown or misplaced crop gives 422, and nothing is saved', async () => {
    await completeFarm(G1);
    const tooShort = await compare(G1, { labSequence: MINE.slice(0, 2) });
    const wrongOrder = await compare(G1, { labSequence: [MINE[1], MINE[0], MINE[2]] });
    const extraKey = await compare(G1, { labSequence: MINE, other: 1 });
    for (const res of [tooShort, wrongOrder, extraKey]) {
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    const unknown = await compare(G1, { labSequence: SEQ('winter-rye', 'banana', 'field-corn') });
    expect(unknown.status).toBe(422);
    expect(unknown.body.error.code).toBe('UNKNOWN_CROP');
    const misplaced = await compare(G1, { labSequence: SEQ('winter-rye', 'winter-rye', 'field-corn') });
    expect(misplaced.status).toBe(422);
    expect(misplaced.body.error.code).toBe('CROP_NOT_ALLOWED_IN_SLOT');
    expect(await PlanSet.countDocuments({})).toBe(0);
  });
});

describe('POST /plans/compare when scoring fails', () => {
  test('the area plans call failing gives 502 SCORING_UNAVAILABLE and saves nothing', async () => {
    await completeFarm(G1);
    jest
      .spyOn(mockScoringClient, 'plans')
      .mockRejectedValueOnce(new AppError(502, 'SCORING_UNAVAILABLE', 'The scoring service is unavailable'));
    const res = await compare(G1);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('SCORING_UNAVAILABLE');
    expect(await PlanSet.countDocuments({})).toBe(0);
  });

  test('the score call for the farmer’s rotation failing gives 502 and saves nothing', async () => {
    await completeFarm(G1);
    await saveDraft(G1);
    jest
      .spyOn(mockScoringClient, 'score')
      .mockRejectedValueOnce(new AppError(502, 'SCORING_UNAVAILABLE', 'The scoring service is unavailable'));
    const res = await compare(G1);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('SCORING_UNAVAILABLE');
    expect(await PlanSet.countDocuments({})).toBe(0);
  });

  test('an area plan with a crop in the wrong slot gives 502 SCORING_INVALID_RESPONSE', async () => {
    await completeFarm(G1);
    const original = mockScoringClient.plans.bind(mockScoringClient);
    jest.spyOn(mockScoringClient, 'plans').mockImplementationOnce(async (args) => {
      const result = await original(args);
      result.plans[0].sequence[0].cropId = 'field-corn'; // field-corn is not allowed in fall_winter
      return result;
    });
    const res = await compare(G1);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('SCORING_INVALID_RESPONSE');
    expect(await PlanSet.countDocuments({})).toBe(0);
  });

  test('the scoring calls carry no user identifiers', async () => {
    await completeFarm(G1);
    await request(app).patch('/api/farm').set(asGuest(G1)).send({ farmName: 'Secret Farm' });
    await saveDraft(G1);
    const plansSpy = jest.spyOn(mockScoringClient, 'plans');
    const scoreSpy = jest.spyOn(mockScoringClient, 'score');
    await compare(G1);
    const sent = JSON.stringify([plansSpy.mock.calls[0][0], scoreSpy.mock.calls[0][0]]);
    expect(sent).not.toMatch(new RegExp(`${G1}|Secret Farm|userId|isGuest|farmName`));
  });
});

describe('POST /plans/choose and GET /plans/active', () => {
  test('returns the ActivePlan object with a future start date', async () => {
    await completeFarm(G1);
    const { body } = await compare(G1);
    const start = isoDay(10);
    const res = await choose(G1, { planSetId: body.planSetId, planKey: 'area_plan_a', startDate: start });
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual([
      'chosenAt', 'dataConfidence', 'evidence', 'fit', 'id', 'infoGaps', 'planKey', 'risksToReview',
      'seasonDetails', 'sequence', 'startDate', 'status', 'title',
    ]);
    expect(res.body.planKey).toBe('area_plan_a');
    expect(res.body.title).toBe('Build the Soil');
    expect(res.body.startDate).toBe(start);
    expect(res.body.status).toBe('placeholder');
    expect(res.body.fit).toHaveLength(5);
    expect(res.body.sequence.map((s) => s.state)).toEqual(['upcoming_next', 'scheduled', 'scheduled']);
    expect(res.body.sequence[0]).toMatchObject({
      slot: 'fall_winter',
      seasonLabel: 'Season 1 · Fall / Winter',
      roleTag: 'Test',
      calendar: { plantingLabel: 'Plant', harvestLabel: 'Harvest' },
    });
    expect(res.body.sequence[0].crop.id).toBe('winter-rye');
  });

  test('the start date defaults to today, so the first season is in progress', async () => {
    await completeFarm(G1);
    const { body } = await compare(G1);
    const res = await choose(G1, { planSetId: body.planSetId, planKey: 'area_plan_b' });
    expect(res.status).toBe(201);
    expect(res.body.startDate).toBe(isoDay(0));
    expect(res.body.sequence.map((s) => s.state)).toEqual(['in_progress', 'upcoming_next', 'scheduled']);
  });

  test('my_plan can be chosen and keeps everything the dashboard needs', async () => {
    await completeFarm(G1);
    const { body } = await compare(G1, { labSequence: MINE });
    const res = await choose(G1, { planSetId: body.planSetId, planKey: 'my_plan' });
    expect(res.status).toBe(201);
    expect(res.body.planKey).toBe('my_plan');
    expect(res.body.title).toBe('My Rotation');
    expect(res.body.sequence.map((s) => s.crop.id)).toEqual(['winter-rye', 'crimson-clover', 'soybeans']);
    expect(res.body.sequence.map((s) => s.roleTag)).toEqual(['Test', 'Test', 'Test']);
    expect(res.body.fit.map((f) => f.metricId)).toEqual(['water', 'soil', 'erosion', 'practicality', 'economy']);
    expect(res.body.seasonDetails).toHaveLength(3);
    expect(res.body.evidence.length).toBeGreaterThan(0);
    expect(res.body.dataConfidence.level).toBe('low');
  });

  test('an empty my_plan cannot be chosen: 409 PLAN_NOT_AVAILABLE and nothing is saved', async () => {
    await completeFarm(G1);
    const { body } = await compare(G1);
    const res = await choose(G1, { planSetId: body.planSetId, planKey: 'my_plan' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PLAN_NOT_AVAILABLE');
    expect(await ActivePlan.countDocuments({})).toBe(0);
  });

  test('choosing twice leaves exactly one active plan', async () => {
    await completeFarm(G1);
    const { body } = await compare(G1);
    await choose(G1, { planSetId: body.planSetId, planKey: 'area_plan_a' });
    await choose(G1, { planSetId: body.planSetId, planKey: 'area_plan_b' });
    expect(await ActivePlan.countDocuments({})).toBe(2);
    expect(await ActivePlan.countDocuments({ archivedAt: null })).toBe(1);
    expect((await active(G1)).body.activePlan.planKey).toBe('area_plan_b');
  });

  test('GET /plans/active returns the chosen plan, or null when there is none', async () => {
    await completeFarm(G1);
    const none = await active(G1);
    expect(none.status).toBe(200);
    expect(none.body).toEqual({ activePlan: null });

    const { body } = await compare(G1);
    const chosen = await choose(G1, { planSetId: body.planSetId, planKey: 'area_plan_a' });
    const res = await active(G1);
    expect(res.status).toBe(200);
    expect(res.body.activePlan.id).toBe(chosen.body.id);
  });

  test("another guest's plan set gives 404; so does an unknown id", async () => {
    await completeFarm(G1);
    const { body } = await compare(G1);
    const other = await choose(G2, { planSetId: body.planSetId, planKey: 'area_plan_a' });
    expect(other.status).toBe(404);
    expect(other.body.error.code).toBe('NOT_FOUND');
    const unknown = await choose(G1, { planSetId: '0123456789abcdef01234567', planKey: 'area_plan_a' });
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('NOT_FOUND');
  });

  test('rejects the old plan keys, a bad id, a bad date and extra keys with 400', async () => {
    await completeFarm(G1);
    const { body } = await compare(G1);
    const good = { planSetId: body.planSetId, planKey: 'area_plan_a' };
    const bad = [
      { ...good, planKey: 'keep_routine' },
      { ...good, planKey: 'improve_soil' },
      { ...good, planSetId: 'abc' },
      { ...good, startDate: '2020-01-01' }, // more than 2 years away
      { ...good, startDate: '2026-02-30' }, // not a real date
      { ...good, startDate: 'tomorrow' },
      { ...good, extra: true },
    ];
    for (const payload of bad) {
      const res = await choose(G1, payload);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await ActivePlan.countDocuments({})).toBe(0);
  });

  test('a plan whose crop was removed from the catalog cannot be chosen (422)', async () => {
    await completeFarm(G1);
    const { body } = await compare(G1);
    await Crop.deleteOne({ id: 'daikon' });
    const res = await choose(G1, { planSetId: body.planSetId, planKey: 'area_plan_b' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNKNOWN_CROP');
    expect(res.body.error.details.unknownIds).toEqual(['daikon']);
    expect(await ActivePlan.countDocuments({})).toBe(0);
  });

  test('a crop removed after choosing is skipped in GET /plans/active', async () => {
    await completeFarm(G1);
    const { body } = await compare(G1);
    await choose(G1, { planSetId: body.planSetId, planKey: 'area_plan_a' });
    await Crop.deleteOne({ id: 'crimson-clover' });
    const res = await active(G1);
    expect(res.body.activePlan.sequence.map((s) => s.crop.id)).toEqual(['winter-rye', 'field-corn']);
  });
    test('the Lab score and the compare calls use the same farm answers and crops (A32)', async () => {
    await completeFarm(G1);
    const scoreSpy = jest.spyOn(mockScoringClient, 'score');
    const plansSpy = jest.spyOn(mockScoringClient, 'plans');
    await saveDraft(G1); // score call 1, from /rotation/score
    await compare(G1); // score call 2 (my_plan) and the plans call
    expect(scoreSpy.mock.calls[0][0].farm).toEqual(scoreSpy.mock.calls[1][0].farm);
    expect(scoreSpy.mock.calls[0][0].sequence).toEqual(scoreSpy.mock.calls[1][0].sequence);
    expect(plansSpy.mock.calls[0][0].farm).toEqual(scoreSpy.mock.calls[0][0].farm);
  });
});