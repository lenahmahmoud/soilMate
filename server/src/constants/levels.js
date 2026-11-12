// Score -> level (guide 10.5, assumption A6: bands 75 / 60 still to be confirmed by the data team).
export const LEVELS = Object.freeze(['high', 'moderate', 'low']);

export const HIGH_MIN = 75;
export const MODERATE_MIN = 60;

export const LEVEL_LABELS = Object.freeze({
  high: Object.freeze({ levelLabel: 'HIGH', fitLabel: 'Good Fit' }),
  moderate: Object.freeze({ levelLabel: 'MODERATE', fitLabel: 'Moderate Fit' }),
  low: Object.freeze({ levelLabel: 'LOW', fitLabel: 'Needs Checking' }),
});

export function isLevel(value) {
  return LEVELS.includes(value);
}

export function levelOf(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError('levelOf expects a finite number');
  }
  if (value >= HIGH_MIN) return 'high';
  if (value >= MODERATE_MIN) return 'moderate';
  return 'low';
}

// Returns { levelLabel, fitLabel } for a valid level.
export function labelsOf(level) {
  if (!isLevel(level)) {
    throw new TypeError(`Unknown level: ${level}`);
  }
  return LEVEL_LABELS[level];
}