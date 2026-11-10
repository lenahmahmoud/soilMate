import path from 'node:path';
import request from 'supertest';
import app from '../../src/app.js';
import { initLayerData, resetLayerData } from '../../src/data/loadLayerData.js';

const SRC = path.resolve('src/data/layers');
const API = '/api'; // change if your app mounts the router elsewhere

beforeAll(() => initLayerData(SRC));
afterAll(() => resetLayerData());

describe('GET /centers', () => {
  test('returns all 3 centers without auth', async () => {
    const res = await request(app).get(`${API}/centers`);
    expect(res.status).toBe(200);
    expect(res.body.centers).toHaveLength(3);
    expect(res.body.coverageNote).toBeTruthy();
  });

  test('?q=des filters', async () => {
    const res = await request(app).get(`${API}/centers?q=des`);
    expect(res.body.centers.map((c) => c.id)).toEqual(['desouk']);
  });

  test('no match returns an empty list, not an error', async () => {
    const res = await request(app).get(`${API}/centers?q=zzz`);
    expect(res.status).toBe(200);
    expect(res.body.centers).toEqual([]);
  });

  test('repeated q is ignored, not a crash', async () => {
    const res = await request(app).get(`${API}/centers?q=a&q=b`);
    expect(res.status).toBe(200);
    expect(res.body.centers).toHaveLength(3);
  });

  test('is cacheable and has an ETag; a matching If-None-Match gets 304', async () => {
    const first = await request(app).get(`${API}/centers`);
    expect(first.headers['cache-control']).toBe('public, max-age=3600');
    expect(first.headers.etag).toBeTruthy();
    const again = await request(app).get(`${API}/centers`).set('If-None-Match', first.headers.etag);
    expect(again.status).toBe(304);
  });
});

describe('GET /map/layers', () => {
  test('lists 5 layers; erosion_risk is unavailable', async () => {
    const res = await request(app).get(`${API}/map/layers`);
    expect(res.status).toBe(200);
    expect(res.body.layers).toHaveLength(5);
    const erosion = res.body.layers.find((l) => l.id === 'erosion_risk');
    expect(erosion).toMatchObject({ available: false, unavailableReason: 'Not available yet' });
  });
});

describe('GET /map/layers/:layerId', () => {
  test.each(['overview', 'soil_moisture', 'crop_health', 'heat_stress'])('%s returns 3 centers', async (id) => {
    const res = await request(app).get(`${API}/map/layers/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.layerId).toBe(id);
    expect(res.body.centers).toHaveLength(3);
    expect(res.body.dataThrough).toMatch(/^\d{4}-\d{2}$/);
  });

  test('erosion_risk -> 404 LAYER_NOT_AVAILABLE (not cached)', async () => {
    const res = await request(app).get(`${API}/map/layers/erosion_risk`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('LAYER_NOT_AVAILABLE');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  test('unknown layer -> 404 NOT_FOUND', async () => {
    const res = await request(app).get(`${API}/map/layers/banana`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});