import { Router } from 'express';
import { answer, skip, complete, abandon } from '../controllers/attemptsController.js';
import { noStore } from '../middleware/noStore.js';
import { validate } from '../middleware/validate.js';
import { attemptIdParam, answerBody, skipBody, emptyBody } from '../schemas/attemptSchemas.js';

const router = Router();

router.use(noStore);

router.post(
  '/:attemptId/answer',
  validate({ params: attemptIdParam, body: answerBody }),
  answer,
);
router.post('/:attemptId/skip', validate({ params: attemptIdParam, body: skipBody }), skip);
router.post(
  '/:attemptId/complete',
  validate({ params: attemptIdParam, body: emptyBody }),
  complete,
);
router.post(
  '/:attemptId/abandon',
  validate({ params: attemptIdParam, body: emptyBody }),
  abandon,
);

export default router;