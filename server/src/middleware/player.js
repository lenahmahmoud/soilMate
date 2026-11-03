import { v4 as uuidv4, validate as uuidValidate, version as uuidVersion } from 'uuid';
import Player from '../models/Player.js';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

export const isUuidV4 = (value) =>
  typeof value === 'string' && uuidValidate(value) && uuidVersion(value) === 4;

export async function playerMiddleware(req, res, next) {
  const header = req.get('X-Player-Id');
  const id = isUuidV4(header) ? header.toLowerCase() : uuidv4();

  req.player = { id };
  res.set('X-Player-Id', id);

  try {
    // Creates the player if it does not exist, and updates lastSeenAt if it does.
    await Player.updateOne({ _id: id }, { $set: { lastSeenAt: new Date() } }, { upsert: true });
  } catch (err) {
    // Never log player ids in production.
    logger.warn(
      env.NODE_ENV === 'production' ? { err } : { err, playerId: id },
      'Could not save player',
    );
  }

  next();
}