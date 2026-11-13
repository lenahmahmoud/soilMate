import { Router } from "express";
import { validate } from "../middleware/validate.js";
import { publicCache } from "../middleware/publicCache.js";
import { listCropsQuery } from "../schemas/cropSchemas.js";
import * as cropsController from "../controllers/cropsController.js";

const router = Router();

router.get("/", publicCache(3600), validate({ query: listCropsQuery }), cropsController.listCrops); // public, cached 1 h

export default router;