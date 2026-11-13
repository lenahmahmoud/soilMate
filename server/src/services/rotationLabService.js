import { getRotationLabData } from "../data/loadRotationLabData.js";
import { CENTERS } from "../constants/centers.js";
import { FALLOW, ROTATION_NEEDS_A_CROP, normalizeSeason, rotationKey } from "../constants/rotationLab.js";
import { AppError } from "../utils/AppError.js";
import * as cropService from "./cropService.js";

// R5.1. Crop items come from cropService, so /crops and /rotation-lab/options always agree.
export function options() {
  const { meta } = getRotationLabData();
  return {
    version: meta.version,
    disclaimer: meta.disclaimer,
    centers: CENTERS.map(({ id, name, nameAr, governorate }) => ({ id, name, nameAr, governorate })),
    winterCrops: cropService.listCrops({ use: "rotation", season: "winter" }).crops,
    summerCrops: cropService.listCrops({ use: "rotation", season: "summer" }).crops,
    rules: { minCrops: 1, invalidMessage: meta.input_rules.invalid[0].message },
  };
}

// R5.2 + R6. `result` is the stored object, untouched.
export function lookup({ center, winter, summer }) {
  const { meta, plansByKey } = getRotationLabData();
  const w = normalizeSeason(winter);
  const s = normalizeSeason(summer);

  if (w === FALLOW && s === FALLOW) {
    throw new AppError(400, ROTATION_NEEDS_A_CROP, meta.input_rules.invalid[0].message);
  }
  const key = rotationKey(center, w, s);
  const result = plansByKey.get(key);
  if (!result) throw new AppError(404, "NOT_FOUND", "No result for this rotation"); // never after boot validation

  const singleSeason = (w === FALLOW) !== (s === FALLOW);
  return {
    key,
    input: { center, winter: w, summer: s },
    singleSeason,
    emptySeason: !singleSeason ? null : w === FALLOW ? "winter" : "summer",
    version: meta.version,
    result,
  };
}

// R5.3: copied as-is from meta.json.
export function meta() {
  const { meta: m } = getRotationLabData();
  return {
    disclaimer: m.disclaimer,
    version: m.version,
    plan_selection: m.plan_selection,
    assumptions: m.assumptions,
    limitations: m.limitations,
    data_period: m.data_period,
  };
}

// R5.4: ui_text.json as-is.
export function uiText() {
  return getRotationLabData().uiText;
}