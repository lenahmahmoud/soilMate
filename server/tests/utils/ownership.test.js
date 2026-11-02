import { assertAttemptOwner } from '../../src/utils/ownership.js';
import { AppError } from '../../src/utils/AppError.js';

describe('assertAttemptOwner', () => {
  test('returns the attempt when it belongs to the player', () => {
    const attempt = { playerId: 'p1' };
    expect(assertAttemptOwner(attempt, 'p1')).toBe(attempt);
  });

  test('throws 403 FORBIDDEN for another player', () => {
    try {
      assertAttemptOwner({ playerId: 'p1' }, 'p2');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.status).toBe(403);
      expect(err.code).toBe('FORBIDDEN');
    }
  });

  test('throws 404 NOT_FOUND when there is no attempt', () => {
    try {
      assertAttemptOwner(null, 'p1');
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect(err.status).toBe(404);
      expect(err.code).toBe('NOT_FOUND');
    }
  });
});