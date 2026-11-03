import { Router } from 'express';
import { getMyProgress, resetMyProgress } from '../controllers/playersController.js';
import { validate } from '../middleware/validate.js';
import { emptyBody } from '../schemas/attemptSchemas.js';

const router = Router();

router.get('/me/progress', getMyProgress);
router.post('/me/reset', validate({ body: emptyBody }), resetMyProgress);

export default router;