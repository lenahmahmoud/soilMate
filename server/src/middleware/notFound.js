import { errorBody } from '../utils/errorResponse.js';

export function notFound(req, res) {
  res.status(404).json(errorBody('NOT_FOUND', 'Route not found'));
}