import { listGames } from '../services/gameService.js';

export async function getGames(req, res) {
  res.json({ games: await listGames(req.player.id) });
}