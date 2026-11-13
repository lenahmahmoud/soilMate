import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireOwner } from '../middleware/owner.js';
import { noStore } from '../middleware/noStore.js';
import { chooseBody } from '../schemas/planSchemas.js';
import * as plansController from '../controllers/plansController.js';

const router = Router();
router.use(requireOwner); // account OR guest; this router is mounted at /plans only
router.use(noStore); // the active plan belongs to one person: it must never be cached

router.post('/choose', validate({ body: chooseBody }), plansController.choose);
router.get('/active', plansController.getActive);

export default router;