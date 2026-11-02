import { env } from './env.js';

export const corsOptions = {
  origin: env.CLIENT_ORIGIN,
  allowedHeaders: ['Content-Type', 'X-Player-Id'],
  exposedHeaders: ['X-Player-Id'],
};