import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { setTestEnv } from '../helpers/testEnv.js';
import Player from '../../src/models/Player.js';
import Question from '../../src/models/Question.js';

const ORIGIN = 'http://localhost:5173';
let mongod;
let createApp;
let noStore;

beforeAll(async () => {
  setTestEnv();
  ({ createApp } = await import('../../src/app.js'));
  ({ noStore } = await import('../../src/middleware/noStore.js'));
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Player.init();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Player.deleteMany({});
});

function testRouter() {
  const router = express.Router();
  router.get('/health', (req, res) => res.json({ status: 'ok' }));
  router.get('/whoami', (req, res) => res.json({ id: req.player.id }));
  router.get('/attempts/current', noStore, (req, res) => res.json({ ok: true }));
  router.get('/cast', async (req, res) => {
    await Question.findById('not-an-id');
    res.json({});
  });
  return router;
}

const build = (options = {}) => createApp({ apiRouter: testRouter(), ...options });

describe('createApp', () => {
  test('helmet security headers are set and x-powered-by is hidden', async () => {
    const res = await request(build()).get('/api/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  test('an /api route gets a player and the X-Player-Id header', async () => {
    const res = await request(build()).get('/api/whoami');
    const id = res.headers['x-player-id'];
    expect(res.status).toBe(200);
    expect(id).toHaveLength(36);
    expect(res.body.id).toBe(id);
    expect(await Player.countDocuments()).toBe(1);
  });

  test('/api/health skips the player middleware', async () => {
    const res = await request(build()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-player-id']).toBeUndefined();
    expect(await Player.countDocuments()).toBe(0);
  });

  test('noStore sets Cache-Control: no-store only where it is used', async () => {
    const app = build();
    const withStore = await request(app).get('/api/attempts/current');
    const without = await request(app).get('/api/whoami');
    expect(withStore.headers['cache-control']).toBe('no-store');
    expect(without.headers['cache-control']).toBeUndefined();
  });

  test('an unknown route returns 404 NOT_FOUND', async () => {
    const app = build();
    const inApi = await request(app).get('/api/nope');
    const outside = await request(app).get('/nope');
    expect(inApi.status).toBe(404);
    expect(inApi.body.error.code).toBe('NOT_FOUND');
    expect(outside.status).toBe(404);
    expect(outside.body.error.code).toBe('NOT_FOUND');
  });

  test('a malformed ObjectId inside a route returns 404 NOT_FOUND', async () => {
    const res = await request(build()).get('/api/cast');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('the rate limiter answers 429 RATE_LIMITED after the limit', async () => {
    const app = build({ rateLimit: { limit: 2 } });
    const statuses = [];
    let last;
    for (let i = 0; i < 3; i += 1) {
      last = await request(app).get('/api/health');
      statuses.push(last.status);
    }
    expect(statuses).toEqual([200, 200, 429]);
    expect(last.body.error.code).toBe('RATE_LIMITED');
  });

  test('CORS allows the client origin and exposes X-Player-Id', async () => {
    const res = await request(build()).get('/api/health').set('Origin', ORIGIN);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(res.headers['access-control-expose-headers']).toMatch(/X-Player-Id/i);
  });
});