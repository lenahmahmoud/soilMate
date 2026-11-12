import { createPythonScoringClient } from '../../src/services/scoring/pythonScoringClient.js';

const corn = {
  id: 'field-corn', name: 'Field Corn', roleTag: 'Main Cash Crop', slots: ['spring', 'summer_fall'],
  family: 'grass', isLegume: false, waterNeed: 'high', groundCover: 'medium', costLevel: 'high',
  equipment: ['standard_tractor'], typicalDays: 120,
};
const farm = {
  waterSource: 'mixed', waterAvailability: 'sometimes_limited', soilType: 'loamy', equipment: [],
  seasonsPerYear: 2, priorities: ['save_water'], landArea: null,
  farmName: 'Secret Farm', userId: 'u1', isGuest: true, currentCrops: [corn],
};

function fakeFetch(response = { ok: true, json: async () => ({ fine: true }) }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return response;
  };
  return { calls, fetchImpl };
}

describe('python client: plans', () => {
  test('posts to /v1/plans and sends only the allowed fields', async () => {
    const { calls, fetchImpl } = fakeFetch();
    const client = createPythonScoringClient({ baseUrl: 'http://py.test/', timeoutMs: 1000, fetchImpl });
    const out = await client.plans({
      requestId: 'req-1',
      centerId: 'desouk',
      farm,
      labSequence: [{ slot: 'spring', crop: corn }],
      candidateCrops: [corn],
    });
    expect(out).toEqual({ fine: true });

    const [{ url, headers, body }] = calls;
    expect(url).toBe('http://py.test/v1/plans');
    expect(headers['X-Request-Id']).toBe('req-1');
    expect(Object.keys(body.farm)).not.toEqual(expect.arrayContaining(['farmName', 'userId', 'isGuest']));
    expect(body.farm.currentCrops[0]).not.toHaveProperty('name');
    expect(body.farm.currentCrops[0]).not.toHaveProperty('roleTag');
    expect(body.labSequence[0].crop).not.toHaveProperty('slots');
    expect(body.candidateCrops[0].slots).toEqual(['spring', 'summer_fall']);
    expect(JSON.stringify(body)).not.toMatch(/Secret Farm|u1|isGuest|Field Corn/);
  });

  test('labSequence stays null when there is none', async () => {
    const { calls, fetchImpl } = fakeFetch();
    const client = createPythonScoringClient({ baseUrl: 'http://py.test', timeoutMs: 1000, fetchImpl });
    await client.plans({ requestId: 'r', centerId: 'desouk', farm, labSequence: null, candidateCrops: [corn] });
    expect(calls[0].body.labSequence).toBeNull();
  });

  test('a non-2xx answer gives 502 SCORING_UNAVAILABLE', async () => {
    const { fetchImpl } = fakeFetch({ ok: false });
    const client = createPythonScoringClient({ baseUrl: 'http://py.test', timeoutMs: 1000, fetchImpl });
    await expect(
      client.plans({ requestId: 'r', centerId: 'desouk', farm, labSequence: null, candidateCrops: [corn] }),
    ).rejects.toMatchObject({ code: 'SCORING_UNAVAILABLE' });
  });
});