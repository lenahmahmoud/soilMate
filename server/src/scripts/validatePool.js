import { loadSeedData } from '../data/loadSeedData.js';
import { validatePool } from '../services/poolValidation.js';

try {
  const { games, questions, iconKeys } = loadSeedData();
  const errors = validatePool({ games, questions, iconKeys });

  if (errors.length) {
    console.error(`Pool validation failed (${errors.length} problem${errors.length === 1 ? '' : 's'}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`Pool is valid: ${games.length} games, ${questions.length} questions.`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}