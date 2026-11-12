import * as farmService from '../services/farmService.js';

export async function getFarm(req, res) {
  res.json(await farmService.getFarm(req.user.id));
}

export async function setCenter(req, res) {
  res.json(await farmService.setCenter(req.user.id, req.body.centerId));
}

export async function putFarm(req, res) {
  res.json(await farmService.putFarm(req.user.id, req.body));
}

export async function patchFarm(req, res) {
  res.json(await farmService.patchFarm(req.user.id, req.body));
}