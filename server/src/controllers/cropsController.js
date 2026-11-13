import * as cropService from "../services/cropService.js";

export function listCrops(req, res) {
  res.json(cropService.listCrops(req.query));
}