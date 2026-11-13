import { seasonProgress, itemStates } from '../../src/utils/seasonProgress.js';

const DAY = 86_400_000;
const START = new Date(Date.UTC(2026, 10, 15)); // 2026-11-15
const DURATIONS = [150, 90, 120];
const at = (elapsedDays) => seasonProgress({
  startDate: START,
  durations: DURATIONS,
  today: new Date(START.getTime() + elapsedDays * DAY + 5 * 3600 * 1000), // time of day must not matter
});

describe('seasonProgress (guide 13.2)', () => {
  test('before the start', () => {
    expect(at(-1)).toMatchObject({ state: 'not_started', currentIndex: 0, dayOfSeason: 0, percent: 0 });
  });

  test('day 1 of the first season', () => {
    expect(at(0)).toMatchObject({ state: 'in_progress', currentIndex: 0, dayOfSeason: 1, totalDays: 150, percent: 1 });
  });

  test('last day of the first season and first day of the second', () => {
    expect(at(149)).toMatchObject({ currentIndex: 0, dayOfSeason: 150, percent: 100 });
    expect(at(150)).toMatchObject({ currentIndex: 1, dayOfSeason: 1, totalDays: 90 });
  });

  test('season boundaries two and three', () => {
    expect(at(239)).toMatchObject({ currentIndex: 1, dayOfSeason: 90, percent: 100 });
    expect(at(240)).toMatchObject({ currentIndex: 2, dayOfSeason: 1, totalDays: 120 });
  });

  test('last day overall and after the end', () => {
    expect(at(359)).toMatchObject({ state: 'in_progress', currentIndex: 2, dayOfSeason: 120, percent: 100 });
    expect(at(360)).toMatchObject({ state: 'completed', percent: 100 });
  });
});

describe('itemStates', () => {
  test('not started: first is next, the rest are scheduled', () => {
    expect(itemStates(at(-5), 3)).toEqual(['upcoming_next', 'scheduled', 'scheduled']);
  });

  test('in progress', () => {
    expect(itemStates(at(0), 3)).toEqual(['in_progress', 'upcoming_next', 'scheduled']);
    expect(itemStates(at(150), 3)).toEqual(['done', 'in_progress', 'upcoming_next']);
    expect(itemStates(at(240), 3)).toEqual(['done', 'done', 'in_progress']);
  });

  test('completed', () => {
    expect(itemStates(at(400), 3)).toEqual(['done', 'done', 'done']);
  });
});