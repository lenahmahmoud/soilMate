import { Router } from 'express';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { publicCache } from '../middleware/publicCache.js';
import {
  getCenterOverview, getCropHealthLayer, getHeatStressLayer, getLandRiskLayer, getSoilMoistureLayer, listCenters,
} from '../controllers/centersController.js';
import { getMapLayerById, listMapLayers } from '../controllers/mapController.js';
import { listGlossary } from '../controllers/glossaryController.js';

const router = Router();

// Generous limit: public, read-only, small responses. Applied per route on purpose: this router is mounted
// at "/", so a router-level limiter would also count requests meant for other routers.
const guard = [createRateLimiter({ limit: 300, windowMs: 60 * 1000 }), publicCache(3600)];

router.get('/centers', ...guard, listCenters);
router.get('/centers/:centerId/overview', ...guard, getCenterOverview);
router.get('/centers/:centerId/layers/crop-health', ...guard, getCropHealthLayer);
router.get('/centers/:centerId/layers/soil-moisture', ...guard, getSoilMoistureLayer);
router.get('/centers/:centerId/layers/heat-stress', ...guard, getHeatStressLayer);
router.get('/centers/:centerId/layers/land-risk', ...guard, getLandRiskLayer);
router.get('/map/layers', ...guard, listMapLayers);
router.get('/map/layers/:layerId', ...guard, getMapLayerById);
router.get('/glossary', ...guard, listGlossary);

export default router;