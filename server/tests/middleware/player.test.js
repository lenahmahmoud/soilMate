import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { jest } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { v4 as uuidv4, validate as uuidValidate, version as uuidVersion } from 'uuid';
import Player from '../../src/models/Player.js';

const isV4 = (v) => uuidValidate(v) && uuidVersion(v) === 4;

let mongod;
let app;

beforeAll(async () => {
  Object.assign(process.env, {
    PORT: '4000',
    NODE_ENV: 'test',
    MONGO_URI: 'mongodb://127.0.0.1:27017/soilmate',
    CLIENT_ORIGIN: 'http://localhost:5173',
    NASA_FEATURE: 'false',
    ATTEMPT_TTL_DAYS: '7',
  });
  const { playerMiddleware } = await import('../../src/middleware/player.js');
  app = express();
  app.use(playerMiddleware);
  app.get('/whoami', (req, res) => res.json({ id: req.player.id }));

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Player.init();
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  jest.restoreAllMocks();
  await Player.deleteMany({});
});

describe('playerMiddleware', () => {
  test('a missing header creates a new player and returns its id', async () => {
    const res = await request(app).get('/whoami');
    const id = res.headers['x-player-id'];
    expect(res.status).toBe(200);
    expect(isV4(id)).toBe(true);
    expect(res.body.id).toBe(id);
    expect(await Player.findById(id).lean()).not.toBeNull();
  });

  test('an invalid header is replaced by a new player', async () => {
    const res = await request(app).get('/whoami').set('X-Player-Id', 'not-a-uuid');
    const id = res.headers['x-player-id'];
    expect(id).not.toBe('not-a-uuid');
    expect(isV4(id)).toBe(true);
    expect(await Player.findById(id).lean()).not.toBeNull();
    expect(await Player.countDocuments()).toBe(1);
  });

  test('a valid UUID that is not v4 is replaced by a new player', async () => {
    const v1 = 'c232ab00-9414-11ec-b3c8-9f6bdeced846';
    const res = await request(app).get('/whoami').set('X-Player-Id', v1);
    const id = res.headers['x-player-id'];
    expect(id).not.toBe(v1);
    expect(isV4(id)).toBe(true);
  });

  test('a valid v4 UUID that is not in the database creates that player', async () => {
    const id = uuidv4();
    const res = await request(app).get('/whoami').set('X-Player-Id', id);
    expect(res.headers['x-player-id']).toBe(id);
    expect(res.body.id).toBe(id);
    expect(await Player.findById(id).lean()).not.toBeNull();
  });

  test('an uppercase v4 UUID is accepted and returned in lowercase', async () => {
    const id = uuidv4();
    const res = await request(app).get('/whoami').set('X-Player-Id', id.toUpperCase());
    expect(res.headers['x-player-id']).toBe(id);
    expect(await Player.countDocuments()).toBe(1);
  });

  test('an existing player gets lastSeenAt updated and is not duplicated', async () => {
    const id = uuidv4();
    const old = new Date('2020-01-01T00:00:00.000Z');
    const created = await Player.create({ _id: id, lastSeenAt: old });

    await request(app).get('/whoami').set('X-Player-Id', id);

    const after = await Player.findById(id).lean();
    expect(after.lastSeenAt.getTime()).toBeGreaterThan(old.getTime() + 24 * 60 * 60 * 1000);
    expect(after.createdAt.getTime()).toBe(created.createdAt.getTime());
    expect(await Player.countDocuments()).toBe(1);
  });

  test('a database failure does not fail the request', async () => {
    const id = uuidv4();
    jest.spyOn(Player, 'updateOne').mockRejectedValueOnce(new Error('db down'));
    const res = await request(app).get('/whoami').set('X-Player-Id', id);
    expect(res.status).toBe(200);
    expect(res.headers['x-player-id']).toBe(id);
    expect(res.body.id).toBe(id);
  });
});