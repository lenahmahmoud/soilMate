import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod;
let connectDB;
let disconnectDB;

beforeAll(async () => {
  Object.assign(process.env, {
    PORT: '4000',
    NODE_ENV: 'test',
    MONGO_URI: 'mongodb://127.0.0.1:27017/soilmate',
    CLIENT_ORIGIN: 'http://localhost:5173',
    NASA_FEATURE: 'false',
    ATTEMPT_TTL_DAYS: '7',
  });
  ({ connectDB, disconnectDB } = await import('../../src/config/db.js'));
  mongod = await MongoMemoryServer.create();
}, 60000);

afterAll(async () => {
  await disconnectDB();
  await mongod.stop();
});

describe('db module', () => {
  test('connectDB connects to the given uri', async () => {
    await connectDB(mongod.getUri());
    expect(mongoose.connection.readyState).toBe(1);
  });

  test('disconnectDB closes the connection', async () => {
    await disconnectDB();
    expect(mongoose.connection.readyState).toBe(0);
  });

  test('strictQuery is on', () => {
    expect(mongoose.get('strictQuery')).toBe(true);
  });
});