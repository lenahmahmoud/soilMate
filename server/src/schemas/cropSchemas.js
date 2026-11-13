import { z } from "zod";
import { SEASONS } from "../constants/rotationLab.js";

// `slot` is gone (C2): an old client that still sends it gets 400 from strictObject.
export const listCropsQuery = z.strictObject({
  use: z.enum(["current", "rotation"]).optional(),
  season: z.enum(SEASONS).optional(),
});