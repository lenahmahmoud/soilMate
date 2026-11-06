import { env } from './env.js';

export const corsOptions = {
  origin: env.CLIENT_ORIGIN,
  allowedHeaders: ['Content-Type', 'X-Player-Id', 'Authorization'],
  exposedHeaders: ['X-Player-Id'],
};