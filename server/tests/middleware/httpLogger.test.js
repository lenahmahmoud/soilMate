import express from 'express';
import request from 'supertest';
import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';
import { setTestEnv } from '../helpers/testEnv.js';

let createHttpLogger;

beforeAll(async () => {
  setTestEnv();
  ({ createHttpLogger } = await import('../../src/middleware/httpLogger.js'));
});

async function logRequest() {
  const lines = [];
  const testLogger = pino({ level: 'info' }, { write: (s) => lines.push(s) });

  const app = express();
  app.use(createHttpLogger(testLogger));
  app.use(express.json());
  app.post('/api/echo', (req, res) => res.json({ ok: true }));

  const playerId = uuidv4();
  await request(app)
    .post('/api/echo')
    .set('X-Player-Id', playerId)
    .send({ secret: 'topsecretvalue' });
  await new Promise((resolve) => setImmediate(resolve));

  return { text: lines.join(''), playerId };
}

describe('httpLogger', () => {
  test('logs the method, url and status code', async () => {
    const { text } = await logRequest();
    expect(text).toContain('/api/echo');
    expect(text).toContain('POST');
    expect(text).toContain('"statusCode":200');
  });

  test('never logs player ids, headers or request bodies', async () => {
    const { text, playerId } = await logRequest();
    expect(text).not.toContain(playerId);
    expect(text).not.toContain('topsecretvalue');
    expect(text).not.toMatch(/x-player-id/i);
  });
});