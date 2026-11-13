import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireOwner } from '../middleware/owner.js';
import { noStore } from '../middleware/noStore.js';
import { centerBody, putFarmBody, patchFarmBody, rotationBody } from '../schemas/farmSchemas.js';
import * as farmController from '../controllers/farmController.js';

const router = Router();
router.use(requireOwner); // a logged-in account OR a guest (X-Guest-Id); this router is mounted at /farm only
router.use(noStore); // the farm belongs to one person: it must never be cached

router.get('/', farmController.getFarm);
router.put('/center', validate({ body: centerBody }), farmController.setCenter);
router.put('/', validate({ body: putFarmBody }), farmController.putFarm);
router.patch('/', validate({ body: patchFarmBody }), farmController.patchFarm);
router.put('/rotation', validate({ body: rotationBody }), farmController.putRotation);

export default router;