import { centerBody, putFarmBody, patchFarmBody } from '../../src/schemas/farmSchemas.js';

const valid = {
  currentCrops: ['maize', 'wheat'],
  waterSource: 'mixed',
  waterSourceOther: null,
  waterAvailability: 'sometimes_limited',
  soilType: 'loamy',
  equipment: ['standard_tractor', 'seed_drill_planter', 'combine_harvester'],
  seasonsPerYear: 2,
  priorities: ['save_water', 'improve_soil'],
};

const ok = (schema, v) => schema.safeParse(v).success;

describe('centerBody', () => {
  test('accepts the 3 centers only', () => {
    expect(ok(centerBody, { centerId: 'desouk' })).toBe(true);
    expect(ok(centerBody, { centerId: 'cairo' })).toBe(false);
    expect(ok(centerBody, {})).toBe(false);
    expect(ok(centerBody, { centerId: 'baltim', extra: 1 })).toBe(false);
  });
});

describe('putFarmBody', () => {
  test('accepts the contract example', () => {
    expect(ok(putFarmBody, valid)).toBe(true);
  });

  test('waterSourceOther may be left out; equipment may be empty', () => {
    const { waterSourceOther, ...rest } = valid;
    expect(ok(putFarmBody, { ...rest, equipment: [] })).toBe(true);
  });

  test.each(['currentCrops', 'waterSource', 'waterAvailability', 'soilType', 'equipment', 'seasonsPerYear', 'priorities'])(
    'rejects a body without %s',
    (field) => {
      const { [field]: _omit, ...rest } = valid;
      expect(ok(putFarmBody, rest)).toBe(false);
    },
  );

  test('currentCrops: 1 to 7 unique', () => {
    expect(ok(putFarmBody, { ...valid, currentCrops: [] })).toBe(false);
    expect(ok(putFarmBody, { ...valid, currentCrops: ['a', 'a'] })).toBe(false);
    expect(ok(putFarmBody, { ...valid, currentCrops: Array.from({ length: 8 }, (_, i) => `c${i}`) })).toBe(false);
    expect(ok(putFarmBody, { ...valid, currentCrops: Array.from({ length: 7 }, (_, i) => `c${i}`) })).toBe(true);
  });

  test('equipment: max 6, unique, known values', () => {
    expect(ok(putFarmBody, { ...valid, equipment: ['standard_tractor', 'standard_tractor'] })).toBe(false);
    expect(ok(putFarmBody, { ...valid, equipment: ['bulldozer'] })).toBe(false);
  });

  test('priorities: 1 to 3, unique', () => {
    expect(ok(putFarmBody, { ...valid, priorities: [] })).toBe(false);
    expect(ok(putFarmBody, { ...valid, priorities: ['save_water', 'improve_soil', 'protect_land', 'earn_more'] })).toBe(false);
    expect(ok(putFarmBody, { ...valid, priorities: ['save_water', 'save_water'] })).toBe(false);
  });

  test('seasonsPerYear must be 1 or 2 (only winter and summer are left)', () => {
    expect(ok(putFarmBody, { ...valid, seasonsPerYear: 4 })).toBe(false);
    expect(ok(putFarmBody, { ...valid, seasonsPerYear: '2' })).toBe(false);
    expect(ok(putFarmBody, { ...valid, seasonsPerYear: 3 })).toBe(false);
    expect(ok(putFarmBody, { ...valid, seasonsPerYear: 1 })).toBe(true);
    expect(ok(putFarmBody, { ...valid, seasonsPerYear: 2 })).toBe(true);
  });

  test('waterSourceOther max 60 characters', () => {
    expect(ok(putFarmBody, { ...valid, waterSource: 'other', waterSourceOther: 'x'.repeat(61) })).toBe(false);
    expect(ok(putFarmBody, { ...valid, waterSource: 'other', waterSourceOther: 'x'.repeat(60) })).toBe(true);
  });

  test('rejects unknown keys (no centerId, no userId)', () => {
    expect(ok(putFarmBody, { ...valid, centerId: 'desouk' })).toBe(false);
    expect(ok(putFarmBody, { ...valid, userId: 'x' })).toBe(false);
  });
});

describe('patchFarmBody', () => {
  test('any single field is accepted', () => {
    expect(ok(patchFarmBody, { farmName: 'Cedar Valley Family Farm' })).toBe(true);
    expect(ok(patchFarmBody, { landArea: { value: 42.5, unit: 'acres' } })).toBe(true);
    expect(ok(patchFarmBody, { centerId: 'baltim' })).toBe(true);
    expect(ok(patchFarmBody, { soilType: 'mostly_clay' })).toBe(true);
  });

  test('empty body and unknown keys are rejected', () => {
    expect(ok(patchFarmBody, {})).toBe(false);
    expect(ok(patchFarmBody, { setupStatus: 'complete' })).toBe(false);
    // the rotation is saved only by PUT /farm/rotation
    expect(ok(patchFarmBody, { rotationInput: { winter: 'wheat', summer: 'maize' } })).toBe(false);
  });

  test('same limits as PUT', () => {
    expect(ok(patchFarmBody, { currentCrops: [] })).toBe(false);
    expect(ok(patchFarmBody, { priorities: ['a'] })).toBe(false);
    expect(ok(patchFarmBody, { farmName: 'x'.repeat(81) })).toBe(false);
    expect(ok(patchFarmBody, { farmLocationText: 'x'.repeat(121) })).toBe(false);
  });

  test('landArea needs a positive value and a known unit', () => {
    expect(ok(patchFarmBody, { landArea: { value: 0, unit: 'acres' } })).toBe(false);
    expect(ok(patchFarmBody, { landArea: { value: -1, unit: 'acres' } })).toBe(false);
    expect(ok(patchFarmBody, { landArea: { value: 5, unit: 'feddan' } })).toBe(false);
    expect(ok(patchFarmBody, { landArea: { value: 5 } })).toBe(false);
  });

  test('farmName and farmLocationText can be cleared with null', () => {
    expect(ok(patchFarmBody, { farmName: null })).toBe(true);
  });
});