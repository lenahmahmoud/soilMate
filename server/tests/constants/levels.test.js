import { levelOf, labelsOf, isLevel } from '../../src/constants/levels.js';

describe('levelOf', () => {
  test.each([
    [100, 'high'], [75, 'high'], [74, 'moderate'], [60, 'moderate'], [59, 'low'], [0, 'low'],
  ])('%i -> %s', (value, level) => expect(levelOf(value)).toBe(level));

  test('rejects non-numbers', () => {
    expect(() => levelOf('80')).toThrow(TypeError);
    expect(() => levelOf(NaN)).toThrow(TypeError);
  });
});

describe('labelsOf', () => {
  test('maps every level to the contract labels', () => {
    expect(labelsOf('high')).toEqual({ levelLabel: 'HIGH', fitLabel: 'Good Fit' });
    expect(labelsOf('moderate')).toEqual({ levelLabel: 'MODERATE', fitLabel: 'Moderate Fit' });
    expect(labelsOf('low')).toEqual({ levelLabel: 'LOW', fitLabel: 'Needs Checking' });
  });
  test('unknown level throws, isLevel guards', () => {
    expect(() => labelsOf('great')).toThrow(TypeError);
    expect(isLevel('high')).toBe(true);
    expect(isLevel('great')).toBe(false);
  });
});