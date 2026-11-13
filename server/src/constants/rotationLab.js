// Rotation Lab constants (addendum R2 / C2). The data ids are snake_case and are used as-is:
// the lookup key "center|winter|summer" is built from them. The loader checks these lists against
// meta.input_rules at boot, so code and data can never disagree.
export const SEASONS = Object.freeze(["winter", "summer"]);
export const SEASON_LABELS = Object.freeze({ winter: "Winter", summer: "Summer" });

export const FALLOW = "fallow";
export const WINTER_CROP_IDS = Object.freeze(["wheat", "faba_bean", "berseem", "sugar_beet"]);
export const SUMMER_CROP_IDS = Object.freeze(["cotton", "rice", "maize"]);
export const WINTER_OPTIONS = Object.freeze([...WINTER_CROP_IDS, FALLOW]);
export const SUMMER_OPTIONS = Object.freeze([...SUMMER_CROP_IDS, FALLOW]);

export const PLAN_TYPES = Object.freeze(["current", "water_saving", "soil_health"]);

export const ROTATION_NEEDS_A_CROP = "ROTATION_LAB_NEEDS_A_CROP";

// `fallow` is not in crop_catalog.json, so it lives here (C2). season "any" = allowed in both.
export const FALLOW_CROP = Object.freeze({
  id: FALLOW,
  name: "No crop this season",
  season: "any",
  roleTags: Object.freeze([]),
  description: "No crop is planted in this season.",
  traits: null,
});

export const rotationKey = (center, winter, summer) => `${center}|${winter}|${summer}`;

// A missing, null or empty season means "no crop this season" (R6).
export const normalizeSeason = (value) => (value == null || value === "" ? FALLOW : value);