import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { createRateLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';
import { signupSchema, loginSchema, forgotPasswordSchema } from '../schemas/authSchemas.js';
import * as authController from '../controllers/authController.js';

export const DEFAULT_LIMITS = {
  signup: { limit: 10, windowMs: 60 * 60 * 1000 },
  login: { limit: 10, windowMs: 15 * 60 * 1000 },
  forgotPassword: { limit: 5, windowMs: 60 * 60 * 1000 },
};

// limits = null turns rate limiting off (used by tests).
export function createAuthRouter({ limits = DEFAULT_LIMITS } = {}) {
  const router = Router();
  const limit = (key) => (limits ? [createRateLimiter(limits[key])] : []);

  router.post('/signup', ...limit('signup'), validate({ body: signupSchema }), authController.signup);
  router.post('/login', ...limit('login'), validate({ body: loginSchema }), authController.login);
  router.post('/logout', requireAuth, authController.logout);
  router.post(
    '/forgot-password',
    ...limit('forgotPassword'),
    validate({ body: forgotPasswordSchema }),
    authController.forgotPassword,
  );

  return router;
}

export default createAuthRouter();