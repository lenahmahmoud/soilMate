import * as planService from '../services/planService.js';

export async function compare(req, res) {
  res.json(await planService.comparePlans(req.user.id, req.body?.labSequence ?? null));
}

export async function choose(req, res) {
  res.status(201).json(await planService.choosePlan(req.user.id, req.body));
}

export async function getActive(req, res) {
  res.json(await planService.getActivePlan(req.user.id));
}