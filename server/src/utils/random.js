import { randomInt } from 'node:crypto';

// Fisher-Yates with crypto randomness. Returns a new array, never mutates the input.
export function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

// n distinct random items.
export function pickRandom(array, n) {
  if (n > array.length) {
    throw new RangeError(`Cannot pick ${n} items from ${array.length}`);
  }
  return shuffle(array).slice(0, n);
}