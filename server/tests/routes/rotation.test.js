import { jest } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { Router } from 'express';

const BBOX = [30.55, 31.05, 30.75, 31.25];

let mongod;
let Farm;
let Crop;
let createApp;
let farmRoutes;
let rotationRoutes;
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
  ({ createApp } = await import('../../src/app.js'));
  ({ default: farmRoutes } = await import('../../src/routes/farmRoutes.js'));
  ({ default: rotationRoutes } = await import('../../src/routes/rotationRoutes.js'));
  await Farm.init();
  await Crop.init();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  const router = Router();
  router.use('/farm', farmRoutes);
  router.use('/rotation', rotationRoutes);
  app = createApp({ apiRouter: router });
  await Crop.create([
    makeCrop('winter-rye', 'Winter Rye', ['fall_winter'], 'fall_winter', false,
      { family: 'grass', isLegume: false, waterNeed: 'low', groundCover: 'high', costLevel: 'low', equipment: ['seed_drill_planter'], typicalDays: 150 }),
    makeCrop('crimson-clover', 'Crimson Clover', ['spring'], 'spring', false,
      { family: 'legume', isLegume: true, waterNeed: 'low', groundCover: 'high', costLevel: 'low', equipment: ['seed_drill_planter'], typicalDays: 90 }),
    makeCrop('field-corn', 'Field Corn', ['spring', 'summer_fall'], 'summer_fall', true,
      { family: 'grass', isLegume: false, waterNeed: 'high', groundCover: 'medium', costLevel: 'high', equipment: ['standard_tractor', 'seed_drill_planter', 'combine_harvester'], typicalDays: 120 }),
    makeCrop('soybeans', 'Soybeans', ['spring', 'summer_fall'], null, true,
      { family: 'legume', isLegume: true, waterNeed: 'medium', groundCover: 'medium', costLevel: 'medium', equipment: ['standard_tractor', 'seed_drill_planter', 'combine_harvester'], typicalDays: 110 }),
  ]);
});

afterEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

function makeCrop(id, name, slots, defaultForSlot, selectableAsCurrent, attributes) {
  return {
    id,
    name,
    category: 'cash_crop',
    roleTag: 'Test',
    description: `About ${name}`,
    slots,
    defaultForSlot,
    selectableAsCurrent,
    image: { file: `${id}.webp`, thumbFile: `${id}.webp`, alt: `${name} in a field` },
    attributes,
  };
}

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

const SEQ = (a = 'winter-rye', b = 'crimson-clover', c = 'field-corn') => ({
  sequence: [
    { slot: 'fall_winter', cropId: a },
    { slot: 'spring', cropId: b },
    { slot: 'summer_fall', cropId: c },
  ],
});

const score = (id, body = SEQ()) => request(app).post('/api/rotation/score').set(asGuest(id)).send(body);
const draft = (id) => request(app).get('/api/rotation/draft').set(asGuest(id));

describe('access and guard', () => {
  test('no token and no guest id gives 401 on both routes', async () => {
    expect((await request(app).get('/api/rotation/draft')).status).toBe(401);
    expect((await request(app).post('/api/rotation/score').send(SEQ())).status).toBe(401);
  });

  test('a malformed guest id gives 400 INVALID_GUEST_ID', async () => {
    const res = await request(app).get('/api/rotation/draft').set(asGuest('1234'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_GUEST_ID');
  });

  test('a farm that is not complete gives 409 FARM_SETUP_INCOMPLETE', async () => {
    const none = await draft(G1); // no farm at all
    expect(none.status).toBe(409);
    expect(none.body.error.code).toBe('FARM_SETUP_INCOMPLETE');

    await request(app).put('/api/farm/center').set(asGuest(G1)).send({ centerId: 'desouk' });
    const centerOnly = await score(G1);
    expect(centerOnly.status).toBe(409);
    expect(centerOnly.body.error.code).toBe('FARM_SETUP_INCOMPLETE');
  });
});

describe('GET /rotation/draft', () => {
  test('returns the default sequence when nothing is saved', async () => {
    await completeFarm(G1);
    const res = await draft(G1);
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('default');
    expect(res.body.cycleLabel).toBe('18-Month Cycle');
    expect(res.body.goals).toEqual([{ id: 'save_water', label: 'Save Water' }]);
    expect(res.body.field).toEqual({ centerId: 'desouk', name: 'Desouk', bbox: BBOX, areaLabel: null });
    expect(res.body.sequence.map((s) => [s.slot, s.crop.id])).toEqual([
      ['fall_winter', 'winter-rye'],
      ['spring', 'crimson-clover'],
      ['summer_fall', 'field-corn'],
    ]);
    expect(res.body.sequence.map((s) => s.slotLabel)).toEqual([
      'Season 1 · Fall / Winter',
      'Season 2 · Spring',
      'Season 3 · Summer / Fall',
    ]);
  });

  test('each crop has exactly id, name, description and a thumb image', async () => {
    await completeFarm(G1);
    const { crop } = (await draft(G1)).body.sequence[0];
    expect(Object.keys(crop).sort()).toEqual(['description', 'id', 'image', 'name']);
    expect(crop.image).toEqual({
      thumbUrl: 'https://api.test.local/static/crops/thumb/winter-rye.webp',
      alt: 'Winter Rye in a field',
    });
  });

  test('areaLabel comes from the land area', async () => {
    await completeFarm(G1);
    await request(app).patch('/api/farm').set(asGuest(G1)).send({ landArea: { value: 42.5, unit: 'acres' } });
    expect((await draft(G1)).body.field.areaLabel).toBe('42.5 Acres');
  });

  test('a saved draft is returned as "saved"', async () => {
    await completeFarm(G1);
    await score(G1, SEQ('winter-rye', 'crimson-clover', 'soybeans'));
    const res = await draft(G1);
    expect(res.body.source).toBe('saved');
    expect(res.body.sequence.map((s) => s.crop.id)).toEqual(['winter-rye', 'crimson-clover', 'soybeans']);
  });

  test('a saved draft whose crop no longer exists falls back to the default', async () => {
    await completeFarm(G1);
    await score(G1, SEQ('winter-rye', 'crimson-clover', 'soybeans'));
    await Crop.deleteOne({ id: 'soybeans' });
    const res = await draft(G1);
    expect(res.body.source).toBe('default');
    expect(res.body.sequence[2].crop.id).toBe('field-corn');
  });

  test("guests never see each other's draft", async () => {
    await completeFarm(G1);
    await completeFarm(G2);
    await score(G1, SEQ('winter-rye', 'crimson-clover', 'soybeans'));
    expect((await draft(G2)).body.source).toBe('default');
  });
});

describe('POST /rotation/score', () => {
  test('returns the 5 metrics in order with the hand-computed mock values', async () => {
    await completeFarm(G1);
    const res = await score(G1);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('placeholder');
    expect(res.body.modelVersion).toBe('mock-0.1');
    expect(new Date(res.body.generatedAt).toISOString()).toBe(res.body.generatedAt);
    expect(res.body.metrics.map((m) => m.id)).toEqual(['water', 'soil', 'erosion', 'practicality', 'economy']);
    expect(res.body.metrics.map((m) => m.value)).toEqual([74, 95, 79, 70, 68]);
    expect(res.body.metrics.map((m) => m.levelLabel)).toEqual(['MODERATE', 'HIGH', 'HIGH', 'MODERATE', 'MODERATE']);
    expect(res.body.metrics.map((m) => m.fitLabel)).toEqual([
      'Moderate Fit', 'Good Fit', 'Good Fit', 'Moderate Fit', 'Moderate Fit',
    ]);
  });

  test('each metric has the contract fields and the contract titles', async () => {
    await completeFarm(G1);
    const { metrics } = (await score(G1)).body;
    for (const m of metrics) {
      expect(Object.keys(m).sort()).toEqual(
        ['basis', 'fitLabel', 'id', 'level', 'levelLabel', 'question', 'reasons', 'text', 'title', 'value'].sort(),
      );
    }
    expect(metrics[0].title).toBe('Water Suitability');
    expect(metrics[2].title).toBe('Erosion & Ground Protection');
  });

  test('returns the sequence, 3 season details, confidence, gaps and notices', async () => {
    await completeFarm(G1);
    const res = await score(G1);
    expect(res.body.sequence).toEqual(SEQ().sequence);
    expect(res.body.seasonDetails.map((d) => d.cropId)).toEqual(['winter-rye', 'crimson-clover', 'field-corn']);
    expect(res.body.dataConfidence.level).toBe('low');
    expect(res.body.gaps).toContain('No local market prices available.');
    expect(res.body.notices).toHaveLength(1);
  });

  test('never leaks internal crop attributes', async () => {
    await completeFarm(G1);
    const text = JSON.stringify((await score(G1)).body);
    expect(text).not.toMatch(/isLegume|typicalDays|costLevel|attributes/);
  });

  test('saves the sequence as the draft', async () => {
    await completeFarm(G1);
    await score(G1);
    const farm = await Farm.findOne({}).lean();
    expect(farm.draftSequence).toEqual(SEQ().sequence);
  });

  test('swapping corn for soybeans changes the scores', async () => {
    await completeFarm(G1);
    const corn = (await score(G1)).body.metrics.find((m) => m.id === 'water').value;
    const soy = (await score(G1, SEQ('winter-rye', 'crimson-clover', 'soybeans'))).body.metrics.find(
      (m) => m.id === 'water',
    ).value;
    expect(soy).toBeGreaterThan(corn);
  });

  test('unknown crop gives 422 UNKNOWN_CROP with the bad ids', async () => {
    await completeFarm(G1);
    const res = await score(G1, SEQ('winter-rye', 'banana', 'field-corn'));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNKNOWN_CROP');
    expect(res.body.error.details.unknownIds).toEqual(['banana']);
  });

  test('crop in the wrong slot gives 422 and does not change the draft', async () => {
    await completeFarm(G1);
    const res = await score(G1, SEQ('winter-rye', 'winter-rye', 'field-corn'));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('CROP_NOT_ALLOWED_IN_SLOT');
    expect((await draft(G1)).body.source).toBe('default');
  });

  test('rejects a bad body with 400 VALIDATION_ERROR', async () => {
    await completeFarm(G1);
    const tooShort = await score(G1, { sequence: SEQ().sequence.slice(0, 2) });
    const wrongOrder = await score(G1, {
      sequence: [SEQ().sequence[1], SEQ().sequence[0], SEQ().sequence[2]],
    });
    const extraKey = await score(G1, { sequence: SEQ().sequence, farm: {} });
    const extraItemKey = await score(G1, {
      sequence: SEQ().sequence.map((s) => ({ ...s, note: 'x' })),
    });
    for (const res of [tooShort, wrongOrder, extraKey, extraItemKey]) {
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(tooShort.body.error.details.issues.some((i) => i.path === 'body.sequence')).toBe(true);
    expect(wrongOrder.body.error.details.issues.some((i) => i.path === 'body.sequence')).toBe(true);
  });
});