import { getProgress } from '../services/progressService.js';
import { resetPlayer } from '../services/playerService.js';

export async function getMyProgress(req, res) {
  res.json(await getProgress(req.player.id));
}

export async function resetMyProgress(req, res) {
  await resetPlayer(req.player.id);
  res.json({ reset: true });
}