import { OPTIONS } from '../constants/options.js';

export function getOptions(req, res) {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(OPTIONS);
}