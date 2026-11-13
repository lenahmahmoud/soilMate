import { Router } from 'express';
import { requireOwner } from '../middleware/owner.js';
import { validate } from '../middleware/validate.js';
import { scoreBodySchema } from '../schemas/rotationSchemas.js';
import { getDraft, postScore } from '../controllers/rotationController.js';

const router = Router();

router.get('/draft', requireOwner, getDraft);
router.post('/score', requireOwner, validate({ body: scoreBodySchema }), postScore);

export default router;