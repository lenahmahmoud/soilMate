import { GAME_SLUGS } from '../constants/enums.js';
import { loadSeedData } from '../data/loadSeedData.js';
import { validatePool } from '../services/poolValidation.js';
import { seedDatabase } from '../services/seedService.js';
import { connectDB, disconnectDB } from '../config/db.js';

const line = (c) => `${c.inserted} inserted, ${c.updated} updated, ${c.unchanged} unchanged`;

async function main() {
  const { games, questions, iconKeys } = loadSeedData();

  const errors = validatePool({ games, questions, iconKeys });
  if (errors.length) {
    console.error(`Pool validation failed. Nothing was written (${errors.length} problems):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  await connectDB();
  const summary = await seedDatabase({ games, questions });

  console.log(`Games: ${line(summary.games)}`);
  for (const slug of GAME_SLUGS) {
    const c = summary.questions[slug] ?? { inserted: 0, updated: 0, unchanged: 0 };
    console.log(`${slug}: ${line(c)}`);
  }
  await disconnectDB();
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
})