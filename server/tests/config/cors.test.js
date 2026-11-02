import express from 'express';
import cors from 'cors';
import request from 'supertest';

const ORIGIN = 'http://localhost:5173';
let app;

beforeAll(async () => {
  Object.assign(process.env, {
    PORT: '4000',
    NODE_ENV: 'test',
    MONGO_URI: 'mongodb://127.0.0.1:27017/soilmate',
    CLIENT_ORIGIN: ORIGIN,
    NASA_FEATURE: 'false',
    ATTEMPT_TTL_DAYS: '7',
  });
  const { corsOptions } = await import('../../src/config/cors.js');
  app = express();
  app.use(cors(corsOptions));
  app.get('/ping', (req, res) => res.json({ ok: true }));
});

describe('cors options', () => {
  test('allows the client origin and exposes X-Player-Id', async () => {
    const res = await request(app).get('/ping').set('Origin', ORIGIN);
    expect(res.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(res.headers['access-control-expose-headers']).toMatch(/X-Player-Id/i);
  });

  test('a preflight request may send X-Player-Id and Content-Type', async () => {
    const res = await request(app)
      .options('/ping')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'x-player-id,content-type');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-headers']).toMatch(/X-Player-Id/i);
    expect(res.headers['access-control-allow-headers']).toMatch(/Content-Type/i);
  });
});