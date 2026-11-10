import path from 'node:path';
import request from 'supertest';
import app from '../../src/app.js';
import { initLayerData, resetLayerData } from '../../src/data/loadLayerData.js';

const SRC = path.resolve('src/data/layers');
const API = '/api'; // change if your app mounts the router elsewhere

beforeAll(() => initLayerData(SRC));
afterAll(() => resetLayerData());

describe('GET /centers/:centerId/overview', () => {
  test('Baltim overview, no auth needed, cacheable', async () => {
    const res = await request(app).get(`${API}/centers/baltim/overview`);
    expect(res.status).toBe(200);
    expect(res.body.center.id).toBe('baltim');
    expect(res.body.tiles).toHaveLength(4);
    expect(res.body.landRisk.indicators).toHaveLength(4);
    expect(res.headers['cache-control']).toBe('public, max-age=3600');
    expect(res.headers.etag).toBeTruthy();
  });

  test('unknown center -> 404 NOT_FOUND, not cached', async () => {
    const res = await request(app).get(`${API}/centers/cairo/overview`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('layer detail endpoints', () => {
  test('crop-health: default has no monthly series, ?include=monthly adds 123', async () => {
    const a = await request(app).get(`${API}/centers/baltim/layers/crop-health`);
    expect(a.status).toBe(200);
    expect(a.body.center.monthlySeries).toBeUndefined();
    const b = await request(app).get(`${API}/centers/baltim/layers/crop-health?include=monthly`);
    expect(b.body.center.monthlySeries).toHaveLength(123);
  });

  test('crop-health: invalid include -> 400 VALIDATION_ERROR', async () => {
    const res = await request(app).get(`${API}/centers/baltim/layers/crop-health?include=everything`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('soil-moisture returns only Baltim rows', async () => {
    const res = await request(app).get(`${API}/centers/baltim/layers/soil-moisture`);
    expect(res.status).toBe(200);
    expect(res.body.calendar).toHaveLength(123);
    expect(res.body.calendar.every((r) => r.center === 'baltim')).toBe(true);
  });

  test('heat-stress has the summary and no daily arrays', async () => {
    const res = await request(app).get(`${API}/centers/baltim/layers/heat-stress`);
    expect(res.status).toBe(200);
    expect(res.body.summary.heat_days_per_year).toBe(6.2);
    expect(JSON.stringify(res.body)).not.toMatch(/"tmax":\s*\[/);
  });

  test('land-risk returns the atlas point', async () => {
    const res = await request(app).get(`${API}/centers/baltim/layers/land-risk`);
    expect(res.status).toBe(200);
    expect(res.body.point.id).toBe('baltim');
    expect(res.body.chartCatalog).toHaveLength(11);
  });

  test.each(['crop-health', 'soil-moisture', 'heat-stress', 'land-risk'])('%s with an unknown center -> 404', async (layer) => {
    const res = await request(app).get(`${API}/centers/cairo/layers/${layer}`);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('GET /glossary', () => {
  test('returns the merged terms', async () => {
    const res = await request(app).get(`${API}/glossary`);
    expect(res.status).toBe(200);
    expect(res.body.terms).toHaveLength(15);
    expect(res.body.terms[0]).toHaveProperty('gameSection');
  });
});