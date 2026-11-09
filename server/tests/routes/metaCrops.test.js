import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { Router } from 'express';

const BASE = 'https://api.test.local';
const IMAGES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/crops');
const TEST_IMAGE = path.join(IMAGES_DIR, '__test-image.webp');

let mongod;
let Crop;
let Player;
let OPTIONS;
let createApp;
let metaRoutes;
let cropsRoutes;

beforeAll(async () => {
  // env.js validates process.env on import, so set everything first.
  Object.assign(process.env, {
    PORT: '4000',
    NODE_ENV: 'test',
    MONGO_URI: 'mongodb://127.0.0.1:27017/soilmate-test',
    CLIENT_ORIGIN: 'http://localhost:5173',
    NASA_FEATURE: 'false',
    ATTEMPT_TTL_DAYS: '7',
    JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
    BCRYPT_COST: '4',
    PUBLIC_BASE_URL: BASE,
  });
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  ({ default: Crop } = await import('../../src/models/Crop.js'));
  ({ default: Player } = await import('../../src/models/Player.js'));
  ({ OPTIONS } = await import('../../src/constants/options.js'));
  ({ createApp } = await import('../../src/app.js'));
  ({ default: metaRoutes } = await import('../../src/routes/metaRoutes.js'));
  ({ default: cropsRoutes } = await import('../../src/routes/cropsRoutes.js'));
  await Crop.init();

  fs.mkdirSync(IMAGES_DIR, { recursive: true });
  fs.writeFileSync(TEST_IMAGE, Buffer.from([0x52, 0x49, 0x46, 0x46]));
}, 60000);

afterAll(async () => {
  fs.rmSync(TEST_IMAGE, { force: true });
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})),
  );
});

const buildApp = () => {
  const router = Router();
  router.use('/meta', metaRoutes);
  router.use('/crops', cropsRoutes);
  return createApp({ apiRouter: router });
};

const makeCrop = (id, name, slots, selectableAsCurrent) => ({
  id,
  name,
  subtitle: 'Sub',
  category: 'cash_crop',
  roleTag: 'Cash Crop',
  benefitTag: null,
  description: `About ${name}`,
  slots,
  selectableAsCurrent,
  image: { file: `${id}.webp`, thumbFile: `${id}.webp`, alt: `${name} field` },
  calendar: { plantingLabel: 'Mar - Apr', harvestLabel: 'Jun - Jul' },
  attributes: {
    family: 'grass',
    isLegume: false,
    waterNeed: 'high',
    groundCover: 'medium',
    costLevel: 'high',
    equipment: ['standard_tractor'],
    typicalDays: 120,
  },
});

const seed = () =>
  Crop.insertMany([
    makeCrop('winter-rye', 'Winter Rye', ['fall_winter'], false),
    makeCrop('crimson-clover', 'Crimson Clover', ['spring'], false),
    makeCrop('field-corn', 'Field Corn', ['spring', 'summer_fall'], true),
    makeCrop('soybeans', 'Soybeans', ['spring', 'summer_fall'], true),
    makeCrop('alfalfa-hay', 'Alfalfa / Hay', ['fall_winter', 'spring'], true),
  ]);

const idsOf = (res) => res.body.crops.map((c) => c.id);
const hasIssue = (res, p) => res.body.error.details.issues.some((i) => i.path === p);

describe('GET /api/meta/options', () => {
  test('is public and returns the options object', async () => {
    const res = await request(buildApp()).get('/api/meta/options');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(JSON.parse(JSON.stringify(OPTIONS)));
    expect(res.body.waterSource).toHaveLength(5);
    expect(res.body.limits.maxPriorities).toBe(3);
  });

  test('is cacheable for one hour', async () => {
    const res = await request(buildApp()).get('/api/meta/options');
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
  });

  test('does not create a game player', async () => {
    await request(buildApp()).get('/api/meta/options');
    expect(await Player.countDocuments()).toBe(0);
  });
});

describe('GET /api/crops', () => {
  test('returns an empty list when there are no crops', async () => {
    const res = await request(buildApp()).get('/api/crops');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ crops: [] });
  });

  test('is public, sorted by name, and never creates a player', async () => {
    await seed();
    const res = await request(buildApp()).get('/api/crops');
    expect(res.status).toBe(200);
    expect(idsOf(res)).toEqual([
      'alfalfa-hay',
      'crimson-clover',
      'field-corn',
      'soybeans',
      'winter-rye',
    ]);
    expect(await Player.countDocuments()).toBe(0);
  });

  test('never exposes attributes, status or database fields', async () => {
    await seed();
    const res = await request(buildApp()).get('/api/crops');
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/attributes|waterNeed|typicalDays|costLevel|isLegume/);
    for (const crop of res.body.crops) {
      expect(crop).not.toHaveProperty('_id');
      expect(crop).not.toHaveProperty('__v');
      expect(crop).not.toHaveProperty('status');
      expect(crop).not.toHaveProperty('defaultForSlot');
    }
  });

  test('has exactly the contract fields', async () => {
    await seed();
    const res = await request(buildApp()).get('/api/crops?slot=fall_winter&use=rotation');
    const rye = res.body.crops.find((c) => c.id === 'winter-rye');
    expect(Object.keys(rye).sort()).toEqual(
      [
        'benefitTag',
        'calendar',
        'category',
        'description',
        'id',
        'image',
        'name',
        'roleTag',
        'selectableAsCurrent',
        'slots',
        'subtitle',
      ].sort(),
    );
    expect(rye.calendar).toEqual({ plantingLabel: 'Mar - Apr', harvestLabel: 'Jun - Jul' });
  });

  test('builds absolute image URLs from PUBLIC_BASE_URL', async () => {
    await seed();
    const res = await request(buildApp()).get('/api/crops');
    const rye = res.body.crops.find((c) => c.id === 'winter-rye');
    expect(rye.image).toEqual({
      url: `${BASE}/static/crops/winter-rye.webp`,
      thumbUrl: `${BASE}/static/crops/thumb/winter-rye.webp`,
      alt: 'Winter Rye field',
    });
  });

  test('use=current returns only the crops selectable as current', async () => {
    await seed();
    const res = await request(buildApp()).get('/api/crops?use=current');
    expect(idsOf(res)).toEqual(['alfalfa-hay', 'field-corn', 'soybeans']);
  });

  test('use=rotation without a slot returns every crop', async () => {
    await seed();
    const res = await request(buildApp()).get('/api/crops?use=rotation');
    expect(res.body.crops).toHaveLength(5);
  });

  test('use=rotation with a slot returns the crops allowed in that slot', async () => {
    await seed();
    const app = buildApp();
    const winter = await request(app).get('/api/crops?use=rotation&slot=fall_winter');
    const spring = await request(app).get('/api/crops?use=rotation&slot=spring');
    const summer = await request(app).get('/api/crops?use=rotation&slot=summer_fall');
    expect(idsOf(winter)).toEqual(['alfalfa-hay', 'winter-rye']);
    expect(idsOf(spring)).toEqual(['alfalfa-hay', 'crimson-clover', 'field-corn', 'soybeans']);
    expect(idsOf(summer)).toEqual(['field-corn', 'soybeans']);
  });

  test('slot alone filters, and use=current can combine with a slot', async () => {
    await seed();
    const app = buildApp();
    const slotOnly = await request(app).get('/api/crops?slot=summer_fall');
    const combined = await request(app).get('/api/crops?use=current&slot=fall_winter');
    expect(idsOf(slotOnly)).toEqual(['field-corn', 'soybeans']);
    expect(idsOf(combined)).toEqual(['alfalfa-hay']);
  });

  test('rejects an unknown use, an unknown slot and unknown query keys', async () => {
    const app = buildApp();
    const badUse = await request(app).get('/api/crops?use=everything');
    const badSlot = await request(app).get('/api/crops?slot=winter');
    const emptySlot = await request(app).get('/api/crops?slot=');
    const extra = await request(app).get('/api/crops?color=green');
    expect(badUse.status).toBe(400);
    expect(badUse.body.error.code).toBe('VALIDATION_ERROR');
    expect(hasIssue(badUse, 'query.use')).toBe(true);
    expect(badSlot.status).toBe(400);
    expect(hasIssue(badSlot, 'query.slot')).toBe(true);
    expect(emptySlot.status).toBe(400);
    expect(extra.status).toBe(400);
  });
});

describe('GET /static (crop images)', () => {
  test('serves a file with a 7-day cache and cross-origin permission', async () => {
    const res = await request(buildApp()).get('/static/crops/__test-image.webp');
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toMatch(/max-age=604800/);
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  test('a missing image gives the standard 404', async () => {
    const res = await request(buildApp()).get('/static/crops/does-not-exist.webp');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('cannot read files outside the public folder', async () => {
    const res = await request(buildApp()).get('/static/%2e%2e/src/app.js');
    expect([403, 404]).toContain(res.status);
    expect(res.text).not.toMatch(/createApp/);
  });

  test('does not serve a directory listing or an index page', async () => {
    const res = await request(buildApp()).get('/static/crops/');
    expect(res.status).toBe(404);
  });
});