import http from 'node:http';
import { createPythonScoringClient } from '../../src/services/scoring/pythonScoringClient.js';

let server;
let baseUrl;
let mode = 'ok';
let received;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      received = { headers: req.headers, body: body ? JSON.parse(body) : null, url: req.url };
      if (mode === 'slow') return; // never answers in time
      if (mode === 'error') { res.statusCode = 500; return res.end('boom'); }
      if (mode === 'badjson') { res.setHeader('Content-Type', 'application/json'); return res.end('{not json'); }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'final' }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  server.closeAllConnections?.();
  await new Promise((resolve) => server.close(resolve));
});

const args = {
  requestId: 'req-1',
  centerId: 'desouk',
  farm: { waterSource: 'rain', waterAvailability: 'often_limited', soilType: 'loamy', equipment: [], seasonsPerYear: 2, priorities: ['save_water'], landArea: null, userId: 'SECRET', isGuest: true },
  sequence: [{ slot: 'fall_winter', crop: { id: 'winter-rye', name: 'Winter Rye', family: 'grass', isLegume: false, waterNeed: 'low', groundCover: 'high', costLevel: 'low', equipment: [], typicalDays: 150 } }],
};

describe('pythonScoringClient', () => {
  const client = () => createPythonScoringClient({ baseUrl, timeoutMs: 150 });

  test('posts to /v1/score with X-Request-Id and only the contract fields', async () => {
    mode = 'ok';
    const result = await client().score(args);
    expect(result).toEqual({ status: 'final' });
    expect(received.url).toBe('/v1/score');
    expect(received.headers['x-request-id']).toBe('req-1');
    expect(received.body.farm.userId).toBeUndefined();
    expect(received.body.farm.isGuest).toBeUndefined();
    expect(received.body.sequence[0].crop.name).toBeUndefined();
    expect(received.body.sequence[0].crop.id).toBe('winter-rye');
  });

  test('timeout -> 502 SCORING_UNAVAILABLE', async () => {
    mode = 'slow';
    await expect(client().score(args)).rejects.toMatchObject({ status: 502, code: 'SCORING_UNAVAILABLE' });
  });

  test('non-2xx -> 502 SCORING_UNAVAILABLE', async () => {
    mode = 'error';
    await expect(client().score(args)).rejects.toMatchObject({ status: 502, code: 'SCORING_UNAVAILABLE' });
  });

  test('service down -> 502 SCORING_UNAVAILABLE', async () => {
    const dead = createPythonScoringClient({ baseUrl: 'http://127.0.0.1:1', timeoutMs: 150 });
    await expect(dead.score(args)).rejects.toMatchObject({ status: 502, code: 'SCORING_UNAVAILABLE' });
  });

  test('body that is not JSON -> 502 SCORING_INVALID_RESPONSE', async () => {
    mode = 'badjson';
    await expect(client().score(args)).rejects.toMatchObject({ status: 502, code: 'SCORING_INVALID_RESPONSE' });
  });
});