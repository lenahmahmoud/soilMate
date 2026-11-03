import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';
import { errorBody } from '../utils/errorResponse.js';
import { logger } from '../config/logger.js';

// Must be the last middleware. It never sends stack traces or database error text.
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    return res.status(err.status).json(errorBody(err.code, err.message, err.details));
  }

  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    return res.status(400).json(errorBody('VALIDATION_ERROR', 'Invalid request', { issues }));
  }

  // Mongoose: a malformed ObjectId
  if (err?.name === 'CastError') {
    return res.status(404).json(errorBody('NOT_FOUND', 'Not found'));
  }

  // express.json(): broken JSON or a body over the size limit
  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json(errorBody('VALIDATION_ERROR', 'Request body is not valid JSON'));
  }
  if (err?.type === 'entity.too.large') {
    return res.status(400).json(errorBody('VALIDATION_ERROR', 'Request body is too large'));
  }

  logger.error({ err }, 'Unhandled error');
  return res.status(500).json(errorBody('INTERNAL', 'Something went wrong'));
}