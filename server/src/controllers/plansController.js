import * as planService from '../services/planService.js';

export async function choose(req, res) {
  res.status(201).json(await planService.choosePlan(req.user.id, req.body));
}

export async function getActive(req, res) {
  res.json(await planService.getActivePlan(req.user.id));
}