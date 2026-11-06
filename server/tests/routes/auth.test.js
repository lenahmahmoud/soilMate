import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Router } from 'express';

const SECRET = 'test-secret-test-secret-test-secret-1234';

let mongod;
let User;
let createApp;
let createAuthRouter;
let requireAuth;

beforeAll(async () => {
  // env.js validates process.env on import, so set everything first (BCRYPT_COST=4 keeps tests fast).
  Object.assign(process.env, {
    PORT: '4000',
    NODE_ENV: 'test',
    MONGO_URI: 'mongodb://127.0.0.1:27017/soilmate-test',
    CLIENT_ORIGIN: 'http://localhost:5173',
    NASA_FEATURE: 'false',
    ATTEMPT_TTL_DAYS: '7',
    JWT_SECRET: SECRET,
    JWT_EXPIRES_DEFAULT: '1d',
    JWT_EXPIRES_REMEMBER: '30d',
    BCRYPT_COST: '4',
  });
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  ({ default: User } = await import('../../src/models/User.js'));
  ({ createApp } = await import('../../src/app.js'));
  ({ createAuthRouter } = await import('../../src/routes/authRoutes.js'));
  ({ requireAuth } = await import('../../src/middleware/auth.js'));
  await User.init();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})),
  );
});

const buildApp = (limits = null) => {
  const router = Router();
  router.use('/auth', createAuthRouter({ limits }));
  router.get('/protected', requireAuth, (req, res) => res.json({ id: req.user.id }));
  return createApp({ apiRouter: router });
};

const signupBody = (over = {}) => ({
  fullName: 'Alex Henderson',
  email: 'alex@example.com',
  password: 'Str0ngPass1',
  confirmPassword: 'Str0ngPass1',
  acceptedTerms: true,
  ...over,
});

const hasIssue = (res, path) =>
  res.body.error.details.issues.some((i) => i.path === path);

describe('POST /api/auth/signup', () => {
  test('creates the user and returns token, expiresAt and a safe user', async () => {
    const res = await request(buildApp()).post('/api/auth/signup').send(signupBody());
    expect(res.status).toBe(201);
    expect(typeof res.body.token).toBe('string');
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(res.body.user).toMatchObject({
      fullName: 'Alex Henderson',
      email: 'alex@example.com',
      phone: null,
      avatarUrl: null,
      emailVerified: false,
    });
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/passwordHash|tokenVersion|__v|Str0ngPass1/);
  });

  test('stores a bcrypt hash and the accepted terms', async () => {
    await request(buildApp()).post('/api/auth/signup').send(signupBody());
    const saved = await User.findOne({ email: 'alex@example.com' }).select('+passwordHash').lean();
    expect(saved.passwordHash).not.toBe('Str0ngPass1');
    expect(saved.passwordHash.startsWith('$2')).toBe(true);
    expect(saved.acceptedTerms.version).toBe('2026-11');
    expect(saved.acceptedTerms.at).toBeInstanceOf(Date);
  });

  test('normalizes the email to lowercase', async () => {
    const res = await request(buildApp())
      .post('/api/auth/signup')
      .send(signupBody({ email: '  Alex@Example.COM ' }));
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('alex@example.com');
  });

  test('the token carries sub and tv=0', async () => {
    const res = await request(buildApp()).post('/api/auth/signup').send(signupBody());
    const payload = jwt.verify(res.body.token, SECRET);
    expect(payload.sub).toBe(res.body.user.id);
    expect(payload.tv).toBe(0);
  });

  test('a duplicate email gives 409, even with different letter case', async () => {
    const app = buildApp();
    await request(app).post('/api/auth/signup').send(signupBody());
    const res = await request(app)
      .post('/api/auth/signup')
      .send(signupBody({ email: 'ALEX@example.com' }));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  test('rejects a weak password', async () => {
    const res = await request(buildApp())
      .post('/api/auth/signup')
      .send(signupBody({ password: 'short', confirmPassword: 'short' }));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(hasIssue(res, 'body.password')).toBe(true);
  });

  test('rejects a password with no number', async () => {
    const res = await request(buildApp())
      .post('/api/auth/signup')
      .send(signupBody({ password: 'OnlyLetters', confirmPassword: 'OnlyLetters' }));
    expect(res.status).toBe(400);
  });

  test('rejects a password longer than 72 characters', async () => {
    const long = `A1${'x'.repeat(71)}`;
    const res = await request(buildApp())
      .post('/api/auth/signup')
      .send(signupBody({ password: long, confirmPassword: long }));
    expect(res.status).toBe(400);
  });

  test('rejects mismatched passwords', async () => {
    const res = await request(buildApp())
      .post('/api/auth/signup')
      .send(signupBody({ confirmPassword: 'Different1' }));
    expect(res.status).toBe(400);
    expect(hasIssue(res, 'body.confirmPassword')).toBe(true);
  });

  test('requires accepted terms', async () => {
    const res = await request(buildApp())
      .post('/api/auth/signup')
      .send(signupBody({ acceptedTerms: false }));
    expect(res.status).toBe(400);
    expect(hasIssue(res, 'body.acceptedTerms')).toBe(true);
  });

  test('rejects an invalid email and a short name', async () => {
    const app = buildApp();
    const a = await request(app).post('/api/auth/signup').send(signupBody({ email: 'nope' }));
    const b = await request(app).post('/api/auth/signup').send(signupBody({ fullName: 'A' }));
    expect(a.status).toBe(400);
    expect(b.status).toBe(400);
  });

  test('rejects unknown keys', async () => {
    const res = await request(buildApp())
      .post('/api/auth/signup')
      .send({ ...signupBody(), isAdmin: true });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  const credentials = { email: 'alex@example.com', password: 'Str0ngPass1' };

  const signupFirst = (app) => request(app).post('/api/auth/signup').send(signupBody());

  test('logs in and returns token, expiresAt and user', async () => {
    const app = buildApp();
    await signupFirst(app);
    const res = await request(app).post('/api/auth/login').send(credentials);
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.email).toBe('alex@example.com');
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|tokenVersion/);
  });

  test('accepts the email in any letter case', async () => {
    const app = buildApp();
    await signupFirst(app);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ ...credentials, email: 'ALEX@Example.com' });
    expect(res.status).toBe(200);
  });

  test('sets lastLoginAt', async () => {
    const app = buildApp();
    await signupFirst(app);
    await request(app).post('/api/auth/login').send(credentials);
    const saved = await User.findOne({ email: 'alex@example.com' }).lean();
    expect(saved.lastLoginAt).toBeInstanceOf(Date);
  });

  test('without rememberMe the token lasts about 1 day', async () => {
    const app = buildApp();
    await signupFirst(app);
    const res = await request(app).post('/api/auth/login').send(credentials);
    const hours = (new Date(res.body.expiresAt).getTime() - Date.now()) / 3600000;
    expect(hours).toBeGreaterThan(23);
    expect(hours).toBeLessThan(25);
  });

  test('with rememberMe the token lasts about 30 days', async () => {
    const app = buildApp();
    await signupFirst(app);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ ...credentials, rememberMe: true });
    const days = (new Date(res.body.expiresAt).getTime() - Date.now()) / 86400000;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });

  test('wrong password and unknown email give the same 401', async () => {
    const app = buildApp();
    await signupFirst(app);
    const wrong = await request(app)
      .post('/api/auth/login')
      .send({ ...credentials, password: 'WrongPass1' });
    const unknown = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'Str0ngPass1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body).toEqual(wrong.body);
  });

  test('rejects a missing password and unknown keys', async () => {
    const app = buildApp();
    const a = await request(app).post('/api/auth/login').send({ email: 'alex@example.com' });
    const b = await request(app).post('/api/auth/login').send({ ...credentials, admin: true });
    expect(a.status).toBe(400);
    expect(b.status).toBe(400);
  });
});

describe('requireAuth', () => {
  const login = async (app) => {
    await request(app).post('/api/auth/signup').send(signupBody());
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'alex@example.com', password: 'Str0ngPass1' });
    return res.body;
  };

  test('lets a valid token through and sets req.user.id', async () => {
    const app = buildApp();
    const { token, user } = await login(app);
    const res = await request(app).get('/api/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
  });

  test('rejects a missing header, a wrong scheme and garbage', async () => {
    const app = buildApp();
    const none = await request(app).get('/api/protected');
    const basic = await request(app).get('/api/protected').set('Authorization', 'Basic abc');
    const junk = await request(app).get('/api/protected').set('Authorization', 'Bearer not.a.jwt');
    for (const res of [none, basic, junk]) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  test('rejects an expired token', async () => {
    const app = buildApp();
    const { user } = await login(app);
    const expired = jwt.sign({ sub: user.id, tv: 0 }, SECRET, { expiresIn: -10 });
    const res = await request(app).get('/api/protected').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });

  test('rejects a token signed with another secret', async () => {
    const app = buildApp();
    const { user } = await login(app);
    const forged = jwt.sign({ sub: user.id, tv: 0 }, 'another-secret-another-secret-123456');
    const res = await request(app).get('/api/protected').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  test('rejects a token whose sub is not an ObjectId (401, not 404)', async () => {
    const app = buildApp();
    const bad = jwt.sign({ sub: 'abc', tv: 0 }, SECRET, { expiresIn: '1h' });
    const res = await request(app).get('/api/protected').set('Authorization', `Bearer ${bad}`);
    expect(res.status).toBe(401);
  });

  test('rejects an old token after tokenVersion changes', async () => {
    const app = buildApp();
    const { token, user } = await login(app);
    await User.updateOne({ _id: user.id }, { $inc: { tokenVersion: 1 } });
    const res = await request(app).get('/api/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  test('rejects a token whose user was deleted', async () => {
    const app = buildApp();
    const { token, user } = await login(app);
    await User.deleteOne({ _id: user.id });
    const res = await request(app).get('/api/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/logout', () => {
  test('returns 204 with a valid token', async () => {
    const app = buildApp();
    const signup = await request(app).post('/api/auth/signup').send(signupBody());
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${signup.body.token}`);
    expect(res.status).toBe(204);
  });

  test('returns 401 without a token', async () => {
    const res = await request(buildApp()).post('/api/auth/logout');
    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/forgot-password', () => {
  const MESSAGE = 'If this email is registered, you will receive reset instructions.';

  test('gives the same answer for a known and an unknown email', async () => {
    const app = buildApp();
    await request(app).post('/api/auth/signup').send(signupBody());
    const known = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'alex@example.com' });
    const unknown = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.com' });
    expect(known.status).toBe(200);
    expect(known.body).toEqual({ message: MESSAGE });
    expect(unknown.body).toEqual(known.body);
  });

  test('rejects an invalid email', async () => {
    const res = await request(buildApp()).post('/api/auth/forgot-password').send({ email: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('auth rate limits', () => {
  test('login returns 429 after the limit is reached', async () => {
    const app = buildApp({
      signup: { limit: 2, windowMs: 60000 },
      login: { limit: 2, windowMs: 60000 },
      forgotPassword: { limit: 2, windowMs: 60000 },
    });
    const body = { email: 'nobody@example.com', password: 'Str0ngPass1' };
    const first = await request(app).post('/api/auth/login').send(body);
    const second = await request(app).post('/api/auth/login').send(body);
    const third = await request(app).post('/api/auth/login').send(body);
    expect(first.status).toBe(401);
    expect(second.status).toBe(401);
    expect(third.status).toBe(429);
    expect(third.body.error.code).toBe('RATE_LIMITED');
  });
});