import { Router } from 'express';
import * as metaController from '../controllers/metaController.js';

const router = Router();

router.get('/options', metaController.getOptions); // public

export default router;