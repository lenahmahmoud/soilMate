import { getGlossary } from '../services/layerService.js';

export function listGlossary(req, res) {
  res.json(getGlossary());
}