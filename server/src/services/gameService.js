import Game from '../models/Game.js';
import { loadPlayerProgress } from './progressService.js';
import { toGameSummary } from '../mappers/gameMappers.js';

export async function listGames(playerId) {
  const [games, { progressBySlug, seenBySlug }] = await Promise.all([
    Game.find().sort({ position: 1 }).lean(),
    loadPlayerProgress(playerId),
  ]);

  return games.map((game) =>
    toGameSummary(game, progressBySlug.get(game.slug), seenBySlug.get(game.slug) ?? 0),
  );
}