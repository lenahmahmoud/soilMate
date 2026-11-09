import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { listCropsQuery } from '../schemas/cropSchemas.js';
import * as cropsController from '../controllers/cropsController.js';

const router = Router();

router.get('/', validate({ query: listCropsQuery }), cropsController.listCrops); // public

export default router;