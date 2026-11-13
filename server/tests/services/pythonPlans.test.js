import { createPythonScoringClient } from '../../src/services/scoring/pythonScoringClient.js';

const corn = {
  id: 'field-corn', name: 'Field Corn', roleTag: 'Main Cash Crop', slots: ['spring', 'summer_fall'],
  family: 'grass', isLegume: false, waterNeed: 'high', groundCover: 'medium', costLevel: 'high',
  equipment: ['standard_tractor'], typicalDays: 120,
};
const farm = {
  waterSource: 'mixed', waterAvailability: 'sometimes_limited', soilType: 'loamy', equipment: [],
  seasonsPerYear: 2, priorities: ['save_water'], landArea: null,
  farmName: 'Secret Farm', userId: 'u1', isGuest: true, currentCrops: ['field-corn'],
};

function fakeFetch(response = { ok: true, json: async () => ({ fine: true }) }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return response;
  };
  return { calls, fetchImpl };
}

const make = (fetchImpl) => createPythonScoringClient({ baseUrl: 'http://py.test/', timeoutMs: 1000, fetchImpl });
const args = { requestId: 'req-1', centerId: 'desouk', farm, candidateCrops: [corn] };

describe('python client: plans (V2 contract)', () => {
  test('posts to /v1/plans with the area, the farm answers and the candidate crops only', async () => {
    const { calls, fetchImpl } = fakeFetch();
    const out = await make(fetchImpl).plans(args);
    expect(out).toEqual({ fine: true });

    const [{ url, headers, body }] = calls;
    expect(url).toBe('http://py.test/v1/plans');
    expect(headers['X-Request-Id']).toBe('req-1');
    expect(Object.keys(body).sort()).toEqual(['candidateCrops', 'centerId', 'farm', 'requestId']);
    expect(body.centerId).toBe('desouk');
    expect(Object.keys(body.farm).sort()).toEqual([
      'equipment', 'landArea', 'priorities', 'seasonsPerYear', 'soilType', 'waterAvailability', 'waterSource',
    ]);
    expect(body.candidateCrops[0].slots).toEqual(['spring', 'summer_fall']);
    expect(body.candidateCrops[0]).not.toHaveProperty('name');
    expect(body.candidateCrops[0]).not.toHaveProperty('roleTag');
  });

  test('labSequence and currentCrops are never forwarded, even if a caller passes them', async () => {
    const { calls, fetchImpl } = fakeFetch();
    await make(fetchImpl).plans({
      ...args,
      labSequence: [{ slot: 'spring', crop: corn }],
    });
    const { body } = calls[0];
    expect(body).not.toHaveProperty('labSequence');
    expect(body.farm).not.toHaveProperty('currentCrops');
  });

  test('no user identifiers reach Python', async () => {
    const { calls, fetchImpl } = fakeFetch();
    await make(fetchImpl).plans(args);
    expect(JSON.stringify(calls[0].body)).not.toMatch(/Secret Farm|u1|isGuest|userId|farmName|Field Corn/);
  });

  test('a non-2xx answer gives 502 SCORING_UNAVAILABLE', async () => {
    const { fetchImpl } = fakeFetch({ ok: false });
    await expect(make(fetchImpl).plans(args)).rejects.toMatchObject({ status: 502, code: 'SCORING_UNAVAILABLE' });
  });

  test('a body that is not JSON gives 502 SCORING_INVALID_RESPONSE', async () => {
    const { fetchImpl } = fakeFetch({
      ok: true,
      json: async () => {
        throw new Error('bad json');
      },
    });
    await expect(make(fetchImpl).plans(args)).rejects.toMatchObject({ status: 502, code: 'SCORING_INVALID_RESPONSE' });
  });
});