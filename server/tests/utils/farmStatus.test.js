import { computeSetupStatus } from '../../src/utils/farmStatus.js';

const full = {
  centerId: 'desouk',
  currentCrops: ['field-corn'],
  waterSource: 'mixed',
  waterAvailability: 'sometimes_limited',
  soilType: 'loamy',
  seasonsPerYear: 2,
  priorities: ['save_water'],
  equipment: [],
};

describe('computeSetupStatus', () => {
  test('none when there is no center', () => {
    expect(computeSetupStatus({ ...full, centerId: null })).toBe('none');
    expect(computeSetupStatus({ currentCrops: [], priorities: [] })).toBe('none');
  });

  test('center_selected when only the center is set', () => {
    expect(computeSetupStatus({ centerId: 'baltim', currentCrops: [], priorities: [], equipment: [] })).toBe('center_selected');
  });

  test('complete when every required field is set (equipment may be empty)', () => {
    expect(computeSetupStatus(full)).toBe('complete');
  });

  test.each([
    ['currentCrops', []],
    ['waterSource', null],
    ['waterAvailability', null],
    ['soilType', null],
    ['seasonsPerYear', null],
    ['priorities', []],
  ])('center_selected when %s is missing', (field, value) => {
    expect(computeSetupStatus({ ...full, [field]: value })).toBe('center_selected');
  });

  test('losing the center drops a complete farm back to none', () => {
    expect(computeSetupStatus({ ...full, centerId: null })).toBe('none');
  });
});