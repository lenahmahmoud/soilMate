import Attempt from '../models/Attempt.js';
import Progress from '../models/Progress.js';
import QuestionHistory from '../models/QuestionHistory.js';

// Deletes the player's attempts, progress and question history. The Player document stays.
export async function resetPlayer(playerId) {
  await Promise.all([
    Attempt.deleteMany({ playerId }),
    Progress.deleteMany({ playerId }),
    QuestionHistory.deleteMany({ playerId }),
  ]);
}