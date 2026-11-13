import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { publicCache } from "../middleware/publicCache.js";
import { createRateLimiter } from "../middleware/rateLimit.js";
import { lookupPlansQuery, noQuery } from "../schemas/rotationLabSchemas.js";
import * as ctrl from "../controllers/rotationLabController.js";

const router = Router();

// Public, read-only static data (R5/R8): no requireOwner, no requireAuth, no database.
// Same limits as the Explore Land endpoints: 300 requests/minute per IP, cached 1 h (ETag comes from Express).
router.use(createRateLimiter({ limit: 300 }), publicCache(3600));

router.get("/options", validate({ query: noQuery }), ctrl.options);
router.get("/plans", validate({ query: lookupPlansQuery }), ctrl.plans);
router.get("/meta", validate({ query: noQuery }), ctrl.meta);
router.get("/ui-text", validate({ query: noQuery }), ctrl.uiText);

export default router;