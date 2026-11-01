import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

mongoose.set('strictQuery', true);

let listenersAttached = false;

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  mongoose.connection.on('error', (err) => logger.error({ err }, 'Mongo connection error'));
  mongoose.connection.on('disconnected', () => logger.warn('Mongo disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('Mongo reconnected'));
}

export async function connectDB(uri = env.MONGO_URI) {
  attachListeners();
  try {
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: env.NODE_ENV !== 'production',
    });
    logger.info('Mongo connected');
  } catch (err) {
    logger.error({ err }, 'Mongo connection failed');
    process.exit(1);
  }
}

export async function disconnectDB() {
  await mongoose.disconnect();
}