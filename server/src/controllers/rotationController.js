import { randomUUID } from 'node:crypto';
import * as rotationService from '../services/rotationService.js';

// Express 5 forwards errors from async handlers by itself.
export async function getDraft(req, res) {
  res.json(await rotationService.getDraft(req.user.id));
}

export async function postScore(req, res) {
  const result = await rotationService.scoreRotation({
    userId: req.user.id,
    sequence: req.body.sequence,
    requestId: req.id ?? randomUUID(),
  });
  res.json(result);
}