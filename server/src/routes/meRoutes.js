import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import {
  updateMeSchema,
  changePasswordSchema,
  deleteMeSchema,
} from '../schemas/profileSchemas.js';
import * as meController from '../controllers/meController.js';

export const DEFAULT_LIMITS = {
  password: { limit: 10, windowMs: 15 * 60 * 1000 },
};

// limits = null turns rate limiting off (used by tests).
export function createMeRouter({ limits = DEFAULT_LIMITS } = {}) {
  const router = Router();
  router.use(requireAuth); // every /me route is private

  router.get('/', meController.getMe);
  router.patch('/', validate({ body: updateMeSchema }), meController.updateMe);
  router.post(
    '/password',
    ...(limits ? [createRateLimiter(limits.password)] : []),
    validate({ body: changePasswordSchema }),
    meController.changePassword,
  );
  router.delete('/', validate({ body: deleteMeSchema }), meController.deleteMe);

  return router;
}

export default createMeRouter();