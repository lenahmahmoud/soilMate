import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { Router } from 'express';
import { randomUUID } from 'node:crypto';

let mongod;
let app;
const GUEST = randomUUID();

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
  const { createApp } = await import('../../src/app.js');
  const { default: farmRoutes } = await import('../../src/routes/farmRoutes.js');
  const router = Router();
  router.use('/farm', farmRoutes);
  app = createApp({ apiRouter: router, rateLimit: { limit: 100000 } });
}, 60000);
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  for (const c of Object.values(mongoose.connection.collections)) await c.deleteMany({});
});

const as = (r) => r.set('X-Guest-Id', GUEST);
const form = (over = {}) => ({
  currentCrops: ['wheat', 'maize'],
  waterSource: 'mixed',
  waterAvailability: 'sometimes_limited',
  soilType: 'loamy',
  equipment: ['standard_tractor'],
  seasonsPerYear: 2,
  priorities: ['save_water'],
  ...over,
});
const withCenter = async () => as(request(app).put('/api/farm/center')).send({ centerId: 'desouk' });

describe('farm current crops use the Rotation Lab crop source (C4)', () => {
  test('PUT /farm accepts the data crops and returns details from memory', async () => {
    await withCenter();
    const res = await as(request(app).put('/api/farm')).send(form());
    expect(res.status).toBe(200);
    expect(res.body.setupStatus).toBe('complete');
    expect(res.body.currentCrops).toEqual(['wheat', 'maize']);
    expect(res.body.currentCropsDetail).toEqual([
      { id: 'wheat', name: 'Wheat', image: { thumbUrl: 'https://api.test.local/static/crops/thumb/wheat.webp', alt: 'Wheat' } },
      { id: 'maize', name: 'Maize', image: { thumbUrl: 'https://api.test.local/static/crops/thumb/maize.webp', alt: 'Maize' } },
    ]);
    expect(res.body.rotationInput).toEqual({ winter: null, summer: null });
    expect(res.body).not.toHaveProperty('draftSequence');
  });

  test.each(['soybeans', 'field-corn', 'winter-wheat', 'fallow', 'banana'])('rejects %s with 422 UNKNOWN_CROP', async (id) => {
    await withCenter();
    const res = await as(request(app).put('/api/farm')).send(form({ currentCrops: ['wheat', id] }));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNKNOWN_CROP');
    expect(res.body.error.details.unknownIds).toEqual([id]);
    const farm = await as(request(app).get('/api/farm'));
    expect(farm.body.currentCrops).toEqual([]); // a rejected save changes nothing
  });

  test('all 7 crops can be current crops, 8 is rejected, duplicates are rejected', async () => {
    await withCenter();
    const all = ['wheat', 'faba_bean', 'berseem', 'sugar_beet', 'cotton', 'rice', 'maize'];
    expect((await as(request(app).put('/api/farm')).send(form({ currentCrops: all }))).status).toBe(200);
    expect((await as(request(app).put('/api/farm')).send(form({ currentCrops: [...all, 'fallow'] }))).status).toBe(400);
    expect((await as(request(app).put('/api/farm')).send(form({ currentCrops: ['wheat', 'wheat'] }))).status).toBe(400);
    expect((await as(request(app).put('/api/farm')).send(form({ currentCrops: [] }))).status).toBe(400);
  });

  test('PATCH /farm validates currentCrops the same way', async () => {
    await withCenter();
    const bad = await as(request(app).patch('/api/farm')).send({ currentCrops: ['soybeans'] });
    expect(bad.status).toBe(422);
    const ok = await as(request(app).patch('/api/farm')).send({ currentCrops: ['rice'] });
    expect(ok.status).toBe(200);
    expect(ok.body.currentCrops).toEqual(['rice']);
  });

  test('saving the form never touches rotationInput', async () => {
    await withCenter();
    const Farm = (await import('../../src/models/Farm.js')).default;
    await Farm.updateOne({}, { $set: { 'rotationInput.winter': 'wheat', 'rotationInput.summer': 'fallow' } });
    const res = await as(request(app).put('/api/farm')).send(form());
    expect(res.body.rotationInput).toEqual({ winter: 'wheat', summer: 'fallow' });
  });
});