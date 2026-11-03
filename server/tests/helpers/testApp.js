import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { setTestEnv } from './testEnv.js';
import { buildPool } from './poolFixture.js';
import { seedDatabase } from '../../src/services/seedService.js';

// In-memory MongoDB seeded with the 5 real games and a valid test question pool.
export async function startTestApp() {
  setTestEnv();
  const { createApp } = await import('../../src/app.js');
  const app = createApp({ rateLimit: { limit: 100000 } });

  const mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await seedDatabase(buildPool());

  return {
    app,
    async stop() {
      await mongoose.disconnect();
      await mongod.stop();
    },
  };
}