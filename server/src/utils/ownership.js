import { AppError } from './AppError.js';

// Call this in every attempt route after loading the attempt.
export function assertAttemptOwner(attempt, playerId) {
  if (!attempt) {
    throw new AppError(404, 'NOT_FOUND', 'Attempt not found');
  }
  if (attempt.playerId !== playerId) {
    throw new AppError(403, 'FORBIDDEN', 'This attempt belongs to another player');
  }
  return attempt;
}