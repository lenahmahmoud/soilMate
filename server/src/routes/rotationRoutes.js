import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireOwner } from '../middleware/owner.js';
import { scoreBody } from '../schemas/rotationSchemas.js';
import * as rotationController from '../controllers/rotationController.js';

const router = Router();
router.use(requireOwner); // account OR guest; this router is mounted at /rotation only

router.get('/draft', rotationController.getDraft);
router.post('/score', validate({ body: scoreBody }), rotationController.score);

export default router;