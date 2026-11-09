import * as cropService from '../services/cropService.js';

export async function listCrops(req, res) {
  res.json(await cropService.listCrops(req.query));
}