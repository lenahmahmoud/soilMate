import { z } from "zod";
import { CENTER_IDS } from "../constants/centers.js";
import { SUMMER_OPTIONS, WINTER_OPTIONS } from "../constants/rotationLab.js";

// A missing, null or empty season means "no crop this season" (R6), so it is allowed here.
const emptyToUndefined = (v) => (v === "" || v === null ? undefined : v);

// Shared with PUT /farm/rotation (C6 / Phase 2): the same rule in one place.
export const rotationChoiceShape = {
  winter: z.preprocess(emptyToUndefined, z.enum(WINTER_OPTIONS).optional()),
  summer: z.preprocess(emptyToUndefined, z.enum(SUMMER_OPTIONS).optional()),
};

// Unknown keys (including "$x" and "a.b") are rejected by strictObject (R7).
export const lookupPlansQuery = z.strictObject({
  center: z.enum(CENTER_IDS),
  ...rotationChoiceShape,
});

export const noQuery = z.strictObject({});