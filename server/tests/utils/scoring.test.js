import {
  calculateStars,
  isBadgeEarned,
  POINTS_PER_FIRST_TRY,
} from '../../src/utils/scoring.js';

describe('scoring', () => {
  test('stars for a round of 5 questions', () => {
    const expected = { 0: 0, 1: 1, 2: 1, 3: 2, 4: 2, 5: 3 };
    for (const [score, stars] of Object.entries(expected)) {
      expect(calculateStars(Number(score), 5)).toBe(stars);
    }
  });

  test('stars for a round of 6 questions', () => {
    const expected = { 0: 0, 1: 0, 2: 1, 3: 1, 4: 2, 5: 2, 6: 3 };
    for (const [score, stars] of Object.entries(expected)) {
      expect(calculateStars(Number(score), 6)).toBe(stars);
    }
  });

  test('an unsupported total throws', () => {
    expect(() => calculateStars(3, 7)).toThrow(RangeError);
  });

  test('the badge needs a score of 4 or more, and a first try is worth 10 points', () => {
    expect(isBadgeEarned(3)).toBe(false);
    expect(isBadgeEarned(4)).toBe(true);
    expect(isBadgeEarned(6)).toBe(true);
    expect(POINTS_PER_FIRST_TRY).toBe(10);
  });
});