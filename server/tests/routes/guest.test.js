import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import { Router } from 'express';

let mongod;
let User;
let Farm;
let ActivePlan;
let createApp;
let createAuthRouter;
let createMeRouter;
let farmRoutes;
let plansRoutes;
let app;

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
    JWT_EXPIRES_DEFAULT: '1d',
    JWT_EXPIRES_REMEMBER: '30d',
    BCRYPT_COST: '4',
    PUBLIC_BASE_URL: 'https://api.test.local',
  });
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  ({ default: User } = await import('../../src/models/User.js'));
  ({ default: Farm } = await import('../../src/models/Farm.js'));
  ({ default: ActivePlan } = await import('../../src/models/ActivePlan.js'));
  ({ createApp } = await import('../../src/app.js'));
  ({ createAuthRouter } = await import('../../src/routes/authRoutes.js'));
  ({ createMeRouter } = await import('../../src/routes/meRoutes.js'));
  ({ default: farmRoutes } = await import('../../src/routes/farmRoutes.js'));
  ({ default: plansRoutes } = await import('../../src/routes/plansRoutes.js'));
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
  router.use('/auth', createAuthRouter({ limits: null }));
  router.use('/me', createMeRouter({ limits: null }));
  router.use('/farm', farmRoutes);
  router.use('/plans', plansRoutes);
  app = createApp({ apiRouter: router });
});

afterEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})),
  );
});

const G1 = '3f2b8a52-6c1e-4b7d-9a35-0d4f7e1c2b90';
const G2 = '9d1c4e77-2a0b-4f63-8e15-7b3a6c5d8e21';
const G3 = 'b7e0a1c9-5d24-4a8f-9c63-1e2f3a4b5c6d';
const PASSWORD = 'Str0ngPass1';

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

const ROTATION = { winter: 'wheat', summer: 'maize' };

const asGuest = (id) => ({ 'X-Guest-Id': id });
const asUser = (token) => ({ Authorization: `Bearer ${token}` });

const guestFarm = async (id, crops = ['wheat']) => {
  await request(app).put('/api/farm/center').set(asGuest(id)).send({ centerId: 'desouk' });
  return request(app).put('/api/farm').set(asGuest(id)).send({ ...FORM, currentCrops: crops });
};

// farm + saved rotation + chosen plan, all as a guest
const guestPlan = async (id) => {
  await guestFarm(id);
  await request(app).put('/api/farm/rotation').set(asGuest(id)).send(ROTATION);
  return request(app).post('/api/plans/choose').set(asGuest(id)).send({ planKey: 'current' });
};

const signup = (email = 'alex@example.com', headers = {}) =>
  request(app).post('/api/auth/signup').set(headers).send({
    fullName: 'Alex Henderson',
    email,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    acceptedTerms: true,
  });

const login = (email = 'alex@example.com', headers = {}) =>
  request(app).post('/api/auth/login').set(headers).send({ email, password: PASSWORD });

describe('using /farm as a guest', () => {
  test('no token and no guest id gives 401', async () => {
    const res = await request(app).get('/api/farm');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  test('a malformed guest id gives 400 INVALID_GUEST_ID and creates nothing', async () => {
    const res = await request(app).get('/api/farm').set(asGuest('1234'));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_GUEST_ID');
    expect(await User.countDocuments()).toBe(0);
  });

  test('a new guest gets the empty farm and a guest user is created', async () => {
    const res = await request(app).get('/api/farm').set(asGuest(G1));
    expect(res.status).toBe(200);
    expect(res.body.setupStatus).toBe('none');
    const guest = await User.findOne({ guestId: G1 }).lean();
    expect(guest.isGuest).toBe(true);
    expect(guest.email).toBe(`guest-${G1}@guest.invalid`);
  });

  test('the same guest id always gives the same farm and one guest user', async () => {
    const a = await request(app).get('/api/farm').set(asGuest(G1));
    const b = await request(app).get('/api/farm').set(asGuest(G1));
    expect(b.body.id).toBe(a.body.id);
    expect(await User.countDocuments({ isGuest: true })).toBe(1);
    expect(await Farm.countDocuments()).toBe(1);
  });

  test('two parallel first requests still make one guest', async () => {
    const [a, b] = await Promise.all([
      request(app).get('/api/farm').set(asGuest(G1)),
      request(app).get('/api/farm').set(asGuest(G1)),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(await User.countDocuments({ isGuest: true })).toBe(1);
  });

  test('the full farm flow works without an account', async () => {
    const res = await guestFarm(G1);
    expect(res.status).toBe(200);
    expect(res.body.setupStatus).toBe('complete');
    const again = await request(app).get('/api/farm').set(asGuest(G1));
    expect(again.body.currentCrops).toEqual(['wheat']);
  });

  test("guests never see each other's farm", async () => {
    await guestFarm(G1);
    const res = await request(app).get('/api/farm').set(asGuest(G2));
    expect(res.body.setupStatus).toBe('none');
    expect(res.body.currentCrops).toEqual([]);
  });

  test('a guest cannot use account routes', async () => {
    const res = await request(app).get('/api/me').set(asGuest(G1));
    expect(res.status).toBe(401);
  });

  test('nobody can log in as a guest', async () => {
    await request(app).get('/api/farm').set(asGuest(G1));
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: `guest-${G1}@guest.invalid`, password: PASSWORD });
    expect([400, 401]).toContain(res.status);
    expect(res.body.token).toBeUndefined();
  });

  test('a token wins over a guest id: the account farm is used, not the guest farm', async () => {
    await guestFarm(G1);
    const { body } = await signup();
    const res = await request(app).get('/api/farm').set({ ...asUser(body.token), ...asGuest(G1) });
    expect(res.body.setupStatus).toBe('none');
  });

  test('a bad token with a guest id is 401, it does not fall back to the guest', async () => {
    const res = await request(app).get('/api/farm').set({ Authorization: 'Bearer nope', ...asGuest(G1) });
    expect(res.status).toBe(401);
  });
});

describe('moving the guest farm into an account (signup / login with X-Guest-Id)', () => {
  test('signup adopts the guest farm', async () => {
    await guestFarm(G1, ['wheat']);
    const res = await signup('alex@example.com', asGuest(G1));
    expect(res.status).toBe(201);
    expect(res.body.guestData).toBe('adopted');

    const farm = await request(app).get('/api/farm').set(asUser(res.body.token));
    expect(farm.body.setupStatus).toBe('complete');
    expect(farm.body.centerId).toBe('desouk');
    expect(farm.body.currentCrops).toEqual(['wheat']);

    expect(await User.countDocuments({ isGuest: true })).toBe(0);
    expect(await Farm.countDocuments()).toBe(1);
  });

  test('signup adopts the guest farm, rotation and active plan', async () => {
    const chosen = await guestPlan(G1);
    expect([200, 201]).toContain(chosen.status);

    const res = await signup('alex@example.com', asGuest(G1));
    expect(res.body.guestData).toBe('adopted');

    const farm = await request(app).get('/api/farm').set(asUser(res.body.token));
    expect(farm.body.rotationInput).toEqual(ROTATION);

    const active = await request(app).get('/api/plans/active').set(asUser(res.body.token));
    expect(active.status).toBe(200);
    expect(active.body.activePlan).not.toBeNull();
    expect(active.body.activePlan.planKey).toBe('current');
    expect(active.body.activePlan.input).toEqual({ center: 'desouk', ...ROTATION });

    expect(await ActivePlan.countDocuments({ archivedAt: null })).toBe(1);
    expect(await User.countDocuments({ isGuest: true })).toBe(0);
  });

  test('login adopts the guest farm when the account has no farm yet', async () => {
    await signup(); // account without a farm
    await guestFarm(G1, ['maize']);
    const res = await login('alex@example.com', asGuest(G1));
    expect(res.status).toBe(200);
    expect(res.body.guestData).toBe('adopted');

    const farm = await request(app).get('/api/farm').set(asUser(res.body.token));
    expect(farm.body.currentCrops).toEqual(['maize']);
    expect(await Farm.countDocuments()).toBe(1);
  });

  test('an account that already has a farm keeps it; the guest data is discarded', async () => {
    const acc = await signup();
    await request(app).put('/api/farm/center').set(asUser(acc.body.token)).send({ centerId: 'baltim' });
    await request(app).put('/api/farm').set(asUser(acc.body.token)).send({ ...FORM, currentCrops: ['maize'] });
    await guestFarm(G1, ['wheat']);

    const res = await login('alex@example.com', asGuest(G1));
    expect(res.body.guestData).toBe('discarded');

    const farm = await request(app).get('/api/farm').set(asUser(res.body.token));
    expect(farm.body.centerId).toBe('baltim');
    expect(farm.body.currentCrops).toEqual(['maize']);
    expect(await User.countDocuments({ isGuest: true })).toBe(0);
    expect(await Farm.countDocuments()).toBe(1);
  });

  test('a discarded guest also loses its active plan', async () => {
    const acc = await signup();
    await request(app).put('/api/farm/center').set(asUser(acc.body.token)).send({ centerId: 'baltim' });
    await request(app).put('/api/farm').set(asUser(acc.body.token)).send({ ...FORM, currentCrops: ['maize'] });
    await guestPlan(G1);
    expect(await ActivePlan.countDocuments()).toBe(1);

    const res = await login('alex@example.com', asGuest(G1));
    expect(res.body.guestData).toBe('discarded');

    const active = await request(app).get('/api/plans/active').set(asUser(res.body.token));
    expect(active.body.activePlan).toBeNull();
    expect(await ActivePlan.countDocuments()).toBe(0);
  });

  test('an unknown guest id gives guestData "none"', async () => {
    const res = await signup('alex@example.com', asGuest(G3));
    expect(res.status).toBe(201);
    expect(res.body.guestData).toBe('none');
  });

  test('without the header the response has no guestData key', async () => {
    const res = await signup();
    expect(res.body).not.toHaveProperty('guestData');
  });

  test('a malformed header is ignored and signup still works', async () => {
    const res = await signup('alex@example.com', asGuest('not-a-uuid'));
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('guestData');
  });

  test('a failed login does not touch the guest data', async () => {
    await guestFarm(G1);
    await signup('alex@example.com');
    const res = await request(app)
      .post('/api/auth/login')
      .set(asGuest(G1))
      .send({ email: 'alex@example.com', password: 'WrongPass1' });
    expect(res.status).toBe(401);
    const still = await request(app).get('/api/farm').set(asGuest(G1));
    expect(still.body.setupStatus).toBe('complete');
  });
});