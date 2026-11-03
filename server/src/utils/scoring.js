export const POINTS_PER_FIRST_TRY = 10;
export const BADGE_MIN_SCORE = 4;

// [minimum score, stars], best first. Keyed by the number of questions in the round.
const STAR_STEPS = {
  5: [
    [5, 3],
    [3, 2],
    [1, 1],
  ],
  6: [
    [6, 3],
    [4, 2],
    [2, 1],
  ],
};

export function calculateStars(score, total) {
  const steps = STAR_STEPS[total];
  if (!steps) throw new RangeError(`Unsupported number of questions: ${total}`);
  for (const [min, stars] of steps) {
    if (score >= min) return stars;
  }
  return 0;
}

export const isBadgeEarned = (score) => score >= BADGE_MIN_SCORE;