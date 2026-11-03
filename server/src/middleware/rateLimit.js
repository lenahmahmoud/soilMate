import { rateLimit } from 'express-rate-limit';
import { errorBody } from '../utils/errorResponse.js';

export function createRateLimiter({ limit = 100, windowMs = 60 * 1000 } = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json(errorBody('RATE_LIMITED', 'Too many requests. Please slow down.'));
    },
  });
}