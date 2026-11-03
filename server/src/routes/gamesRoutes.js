import { Router } from 'express';
import { getGames } from '../controllers/gamesController.js';
import { start, current } from '../controllers/attemptsController.js';
import { noStore } from '../middleware/noStore.js';
import { validate } from '../middleware/validate.js';
import { slugParam, emptyBody } from '../schemas/attemptSchemas.js';

const router = Router();

router.get('/', getGames);
router.post(
  '/:slug/attempts',
  noStore,
  validate({ params: slugParam, body: emptyBody }),
  start,
);
router.get('/:slug/attempts/current', noStore, validate({ params: slugParam }), current);

export default router;