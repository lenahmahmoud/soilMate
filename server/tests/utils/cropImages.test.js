import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkCropImages, imageRowOk } from '../../src/utils/cropImages.js';

// C5: the crop images live in public/crops/<id>.webp and public/crops/thumb/<id>.webp.
// The server never refuses to start for a missing image, but the validation script must
// report it (and fail with --strict).
let tmp;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'crop-images-'));
  fs.mkdirSync(path.join(tmp, 'crops', 'thumb'), { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

const write = (rel) => fs.writeFileSync(path.join(tmp, rel), 'x');

describe('checkCropImages', () => {
  test('reports the full image and the thumbnail of every crop', () => {
    write(path.join('crops', 'wheat.webp'));
    write(path.join('crops', 'thumb', 'wheat.webp'));

    const rows = checkCropImages(tmp, ['wheat']);
    expect(rows).toEqual([{ id: 'wheat', full: true, thumb: true }]);
    expect(imageRowOk(rows[0])).toBe(true);
  });

  test('a crop without images is reported, not thrown', () => {
    const rows = checkCropImages(tmp, ['maize']);
    expect(rows).toEqual([{ id: 'maize', full: false, thumb: false }]);
    expect(imageRowOk(rows[0])).toBe(false);
  });

  test('a missing thumbnail alone is enough to fail the row', () => {
    write(path.join('crops', 'rice.webp'));
    const rows = checkCropImages(tmp, ['rice']);
    expect(rows[0].full).toBe(true);
    expect(rows[0].thumb).toBe(false);
    expect(imageRowOk(rows[0])).toBe(false);
  });

  test('the thumbnail folder is not confused with the full image folder', () => {
    write(path.join('crops', 'thumb', 'cotton.webp'));
    const rows = checkCropImages(tmp, ['cotton']);
    expect(rows[0].full).toBe(false);
    expect(rows[0].thumb).toBe(true);
    expect(imageRowOk(rows[0])).toBe(false);
  });

  test('every crop is returned, in the order it was asked for', () => {
    const rows = checkCropImages(tmp, ['a', 'b', 'c']);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });
});
