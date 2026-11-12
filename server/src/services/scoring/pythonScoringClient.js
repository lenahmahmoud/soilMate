import { AppError } from '../../utils/AppError.js';

// Only these fields may reach Python (contract section 11): no user ids, no guest ids.
const FARM_FIELDS = [
  'waterSource',
  'waterAvailability',
  'soilType',
  'equipment',
  'seasonsPerYear',
  'priorities',
  'landArea',
];
const CROP_FIELDS = [
  'id',
  'family',
  'isLegume',
  'waterNeed',
  'groundCover',
  'costLevel',
  'equipment',
  'typicalDays',
];

const pick = (obj, fields) => Object.fromEntries(fields.map((f) => [f, obj[f]]));

const unavailable = () =>
  new AppError(502, 'SCORING_UNAVAILABLE', 'The scoring service is not available right now');

export function createPythonScoringClient({ baseUrl, timeoutMs, fetchImpl = fetch }) {
  const root = baseUrl.replace(/\/+$/, '');

  async function post(path, requestId, body) {
    let res;
    try {
      res = await fetchImpl(`${root}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': requestId },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs), // no retry
      });
    } catch {
      throw unavailable(); // network error or timeout
    }
    if (!res.ok) throw unavailable();
    try {
      return await res.json();
    } catch {
      throw new AppError(502, 'SCORING_INVALID_RESPONSE', 'The scoring service returned an unexpected answer');
    }
  }

  return {
    async score({ requestId, centerId, farm, sequence }) {
      return post('/v1/score', requestId, {
        requestId,
        centerId,
        farm: pick(farm, FARM_FIELDS),
        sequence: sequence.map(({ slot, crop }) => ({ slot, crop: pick(crop, CROP_FIELDS) })),
      });
    },
  };
}