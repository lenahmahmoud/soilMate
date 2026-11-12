import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireOwner } from '../middleware/owner.js';
import { centerBody, putFarmBody, patchFarmBody } from '../schemas/farmSchemas.js';
import * as farmController from '../controllers/farmController.js';

const router = Router();
router.use(requireOwner); // a logged-in account OR a guest (X-Guest-Id); this router is mounted at /farm only

router.get('/', farmController.getFarm);
router.put('/center', validate({ body: centerBody }), farmController.setCenter);
router.put('/', validate({ body: putFarmBody }), farmController.putFarm);
router.patch('/', validate({ body: patchFarmBody }), farmController.patchFarm);

export default router;