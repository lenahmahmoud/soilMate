import { shuffle, pickRandom } from '../../src/utils/random.js';

describe('random utils', () => {
  test('shuffle keeps the same items and does not mutate the input', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const copy = [...input];
    const out = shuffle(input);
    expect(input).toEqual(copy);
    expect([...out].sort()).toEqual(copy);
  });

  test('shuffle can produce different orders', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const firsts = new Set();
    for (let i = 0; i < 200; i += 1) firsts.add(shuffle(input)[0]);
    expect(firsts.size).toBeGreaterThan(1);
  });

  test('pickRandom returns n distinct items', () => {
    const out = pickRandom([1, 2, 3, 4, 5], 3);
    expect(out).toHaveLength(3);
    expect(new Set(out).size).toBe(3);
  });

  test('pickRandom throws when n is bigger than the array', () => {
    expect(() => pickRandom([1, 2], 3)).toThrow(RangeError);
  });
});