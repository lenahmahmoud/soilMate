import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireOwner } from '../middleware/owner.js';
import { compareBody, chooseBody } from '../schemas/planSchemas.js';
import * as plansController from '../controllers/plansController.js';

const router = Router();
router.use(requireOwner); // account OR guest; this router is mounted at /plans only

router.post('/compare', validate({ body: compareBody }), plansController.compare);
router.post('/choose', validate({ body: chooseBody }), plansController.choose);
router.get('/active', plansController.getActive);

export default router;