import { errorBody } from '../utils/errorResponse.js';
import { searchCenters } from '../services/explorerService.js';
import { getCropHealth, getHeatStress, getLandRisk, getOverview, getSoilMoisture } from '../services/layerService.js';

export function listCenters(req, res) {
  // q is optional; anything that is not a single string (e.g. ?q=a&q=b) is treated as "no filter".
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  res.json(searchCenters(q));
}

function notFound(res) {
  res.set('Cache-Control', 'no-store'); // do not let a cache keep an error
  return res.status(404).json(errorBody('NOT_FOUND', 'Unknown center.'));
}

const send = (build) => (req, res) => {
  const body = build(req.params.centerId);
  return body ? res.json(body) : notFound(res);
};

export const getCenterOverview = send(getOverview);
export const getSoilMoistureLayer = send(getSoilMoisture);
export const getHeatStressLayer = send(getHeatStress);
export const getLandRiskLayer = send(getLandRisk);

export function getCropHealthLayer(req, res) {
  const { include } = req.query;
  if (include !== undefined && include !== 'monthly') {
    res.set('Cache-Control', 'no-store');
    return res.status(400).json(errorBody('VALIDATION_ERROR', 'Invalid query.', { include: 'Must be "monthly" or omitted.' }));
  }
  const body = getCropHealth(req.params.centerId, { includeMonthly: include === 'monthly' });
  return body ? res.json(body) : notFound(res);
}