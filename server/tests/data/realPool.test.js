import { loadSeedData } from '../../src/data/loadSeedData.js';
import { validatePool } from '../../src/services/poolValidation.js';

test('the real seed data passes every pool rule', () => {
  const data = loadSeedData();
  expect(validatePool(data)).toEqual([]);
  expect(data.games).toHaveLength(5);
  expect(data.questions).toHaveLength(126);
});