import Progress from '../models/Progress.js';
import QuestionHistory from '../models/QuestionHistory.js';
import { toProgress } from '../mappers/gameMappers.js';

// Best results and "questions seen" counts for one player, keyed by game slug.
export async function loadPlayerProgress(playerId) {
  const [progressRows, seenRows] = await Promise.all([
    Progress.find({ playerId }).lean(),
    QuestionHistory.aggregate([
      { $match: { playerId } },
      { $group: { _id: '$gameSlug', count: { $sum: 1 } } },
    ]),
  ]);

  return {
    progressBySlug: new Map(progressRows.map((p) => [p.gameSlug, p])),
    seenBySlug: new Map(seenRows.map((r) => [r._id, r.count])),
  };
}

export async function getProgress(playerId) {
  const { progressBySlug, seenBySlug } = await loadPlayerProgress(playerId);
  return toProgress(progressBySlug, seenBySlug);
}