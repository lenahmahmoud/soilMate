import * as rotationLabService from "../services/rotationLabService.js";

export const options = (req, res) => res.json(rotationLabService.options());
export const plans = (req, res) => res.json(rotationLabService.lookup(req.query));
export const meta = (req, res) => res.json(rotationLabService.meta());
export const uiText = (req, res) => res.json(rotationLabService.uiText());