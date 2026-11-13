import { jest } from '@jest/globals';

// C2: the crop source is the Rotation Lab data, joined in memory. The Mongo Crop model is gone
// with the retired flow, so the service must not import it any more.

const { listCrops, getCropsByIds, findInvalidCurrentCropIds } = await import(
  '../../src/services/cropService.js'
);
const { getRotationLabData } = await import('../../src/data/loadRotationLabData.js');

describe('cropService: the Rotation Lab data is the only crop source', () => {
  test('listCrops returns the 7 catalog crops and fallow, in catalog order', () => {
    const { crops } = listCrops();
    expect(crops.map((c) => c.id)).toEqual([
      'wheat',
      'faba_bean',
      'berseem',
      'sugar_beet',
      'cotton',
      'rice',
      'maize',
      'fallow',
    ]);
  });

  test('the crops carry only the display data, never the traits', () => {
    const { crops } = listCrops();
    for (const crop of crops) {
      expect(Object.keys(crop).sort()).toEqual([
        'description',
        'id',
        'image',
        'name',
        'roleTags',
        'season',
      ]);
      expect(crop.traits).toBeUndefined();
    }
  });

  test('use=current leaves out fallow, use=rotation keeps it', () => {
    expect(listCrops({ use: 'current' }).crops.map((c) => c.id)).not.toContain('fallow');
    expect(listCrops({ use: 'rotation' }).crops.map((c) => c.id)).toContain('fallow');
  });

  test('a season filter keeps only that season, fallow comes back for the rotation list', () => {
    expect(listCrops({ season: 'winter' }).crops.map((c) => c.id)).toEqual([
      'wheat',
      'faba_bean',
      'berseem',
      'sugar_beet',
      'fallow',
    ]);
    expect(listCrops({ use: 'current', season: 'summer' }).crops.map((c) => c.id)).toEqual([
      'cotton',
      'rice',
      'maize',
    ]);
  });

  test('getCropsByIds returns the internal records and skips unknown ids', () => {
    const crops = getCropsByIds(['wheat', 'banana', 'maize']);
    expect(crops.map((c) => c.id)).toEqual(['wheat', 'maize']);
    expect(crops[0].traits).toBeDefined(); // the traits stay internal
  });

  test('findInvalidCurrentCropIds rejects retired and unknown ids, but never fallow', () => {
    expect(findInvalidCurrentCropIds(['wheat', 'maize'])).toEqual([]);
    expect(findInvalidCurrentCropIds(['soybeans', 'field-corn', 'winter-wheat'])).toEqual([
      'soybeans',
      'field-corn',
      'winter-wheat',
    ]);
    expect(findInvalidCurrentCropIds(['fallow'])).toEqual(['fallow']);
    expect(findInvalidCurrentCropIds(['banana'])).toEqual(['banana']);
  });

  test('the data comes from the loaded Rotation Lab files', () => {
    const { cropOrder } = getRotationLabData();
    expect(listCrops({ use: 'current' }).crops.map((c) => c.id)).toEqual(cropOrder);
  });
});
