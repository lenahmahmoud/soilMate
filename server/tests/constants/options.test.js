import { OPTIONS } from '../../src/constants/options.js';
import {
  WATER_SOURCES,
  WATER_AVAILABILITY,
  SOIL_TYPES,
  EQUIPMENT,
  SEASONS_PER_YEAR,
  PRIORITIES,
  AREA_UNITS,
} from '../../src/constants/soilmateEnums.js';
import { SEASONS } from '../../src/constants/rotationLab.js';

const ids = (list) => list.map((o) => o.id);

describe('OPTIONS match the validation enums', () => {
  test.each([
    ['waterSource', WATER_SOURCES],
    ['waterAvailability', WATER_AVAILABILITY],
    ['soilType', SOIL_TYPES],
    ['equipment', EQUIPMENT],
    ['seasonsPerYear', SEASONS_PER_YEAR],
    ['priority', PRIORITIES],
    ['seasons', SEASONS],
  ])('%s ids equal the enum, in the same order', (key, enumList) => {
    expect(ids(OPTIONS[key])).toEqual(enumList);
  });

  test('areaUnit equals AREA_UNITS', () => {
    expect(OPTIONS.areaUnit).toEqual(AREA_UNITS);
  });
});

describe('OPTIONS content', () => {
  test('every option has a non-empty label', () => {
    for (const key of [
      'waterSource',
      'waterAvailability',
      'soilType',
      'equipment',
      'seasonsPerYear',
      'priority',
      'seasons',
    ]) {
      for (const option of OPTIONS[key]) {
        expect(typeof option.label).toBe('string');
        expect(option.label.length).toBeGreaterThan(0);
      }
    }
  });

  test('seasonsPerYear ids are numbers and only 2 is recommended', () => {
    expect(OPTIONS.seasonsPerYear.every((o) => typeof o.id === 'number')).toBe(true);
    expect(OPTIONS.seasonsPerYear.filter((o) => o.recommended).map((o) => o.id)).toEqual([2]);
  });

  test('every priority has a profileLabel', () => {
    for (const p of OPTIONS.priority) expect(p.profileLabel.length).toBeGreaterThan(0);
    expect(OPTIONS.priority.find((p) => p.id === 'protect_land').profileLabel).toBe(
      'Protect My Land',
    );
  });

  test('only the two Rotation Lab seasons are left', () => {
    expect(OPTIONS.seasons.map((s) => s.order)).toEqual([1, 2]);
    expect(OPTIONS.seasons.map((s) => s.label)).toEqual(['Winter', 'Summer']);
    expect(OPTIONS).not.toHaveProperty('slots'); // the old three-season list is gone
  });

  test('the "Not Sure" soil hint no longer mentions USDA SSURGO', () => {
    const notSure = OPTIONS.soilType.find((s) => s.id === 'not_sure');
    expect(notSure.hint).not.toMatch(/USDA|SSURGO/i);
  });

  test('limits.maxPriorities is 3', () => {
    expect(OPTIONS.limits).toEqual({ maxPriorities: 3 });
  });

  test('the object is frozen, so a request cannot change it', () => {
    expect(Object.isFrozen(OPTIONS)).toBe(true);
    expect(Object.isFrozen(OPTIONS.waterSource[0])).toBe(true);
  });
});