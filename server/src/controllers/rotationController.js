import * as rotationService from '../services/rotationService.js';

export async function getDraft(req, res) {
  res.json(await rotationService.getDraft(req.user.id));
}

export async function score(req, res) {
  res.json(await rotationService.scoreRotation(req.user.id, req.body.sequence));
}