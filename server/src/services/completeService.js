import Attempt from '../models/Attempt.js';
import Game from '../models/Game.js';
import Progress from '../models/Progress.js';
import Question from '../models/Question.js';
import { AppError } from '../utils/AppError.js';
import { assertAttemptOwner } from '../utils/ownership.js';
import { calculateStars, isBadgeEarned } from '../utils/scoring.js';
import { loadPlayerProgress } from './progressService.js';
import { toProgress } from '../mappers/gameMappers.js';
import { toCompleteResponse } from '../mappers/completeMapper.js';

function computeResult(attempt, completedAt) {
  const score = attempt.questions.filter((q) => q.firstTryCorrect).length;
  return {
    score,
    total: attempt.total,
    stars: calculateStars(score, attempt.total),
    badgeEarned: isBadgeEarned(score),
    completedAt,
  };
}

// Best result per game is the attempt with the most points. badgeEarned never goes back to false.
async function saveProgress(attempt) {
  const { playerId, gameSlug, result, points } = attempt;
  const filter = { playerId, gameSlug };
  const best = { bestScore: result.score, bestStars: result.stars, bestPoints: points };

  const upsert = () =>
    Progress.updateOne(
      filter,
      {
        $setOnInsert: best,
        $inc: { timesPlayed: 1 },
        $max: { badgeEarned: result.badgeEarned },
        $set: { completedAt: result.completedAt },
      },
      { upsert: true, setDefaultsOnInsert: false },
    );

  try {
    await upsert();
  } catch (err) {
    // Two first completions at the same moment can collide on the unique index. Try once more.
    if (err?.code !== 11000) throw err;
    await upsert();
  }

  await Progress.updateOne({ ...filter, bestPoints: { $lt: points } }, { $set: best });
}

async function buildResponse(attempt) {
  const [games, questions] = await Promise.all([
    Game.find().sort({ position: 1 }).lean(),
    Question.find({ _id: { $in: attempt.questions.map((q) => q.questionId) } })
      .select('collectionItem')
      .lean(),
  ]);

  const game = games.find((g) => g.slug === attempt.gameSlug);
  if (!game) throw new AppError(500, 'INTERNAL', 'Game data is missing');

  let progress = null;
  if (game.isFinale) {
    const { progressBySlug, seenBySlug } = await loadPlayerProgress(attempt.playerId);
    progress = { progressBySlug, summary: toProgress(progressBySlug, seenBySlug) };
  }

  return toCompleteResponse({ attempt, game, games, questions, progress });
}

export async function completeAttempt({ attemptId, playerId }) {
  const attempt = await Attempt.findById(attemptId).lean();
  assertAttemptOwner(attempt, playerId);

  // Idempotent: a completed attempt returns its result again and adds nothing.
  if (attempt.status === 'completed') return buildResponse(attempt);

  if (attempt.status !== 'active') {
    throw new AppError(409, 'ATTEMPT_NOT_ACTIVE', 'This attempt is not active');
  }
  if (!attempt.questions.every((q) => q.resolved)) {
    throw new AppError(409, 'ATTEMPT_NOT_FINISHED', 'Answer or skip every question first');
  }

  const result = computeResult(attempt, new Date());

  // Only one request can move the attempt from active to completed. That request saves progress.
  const completed = await Attempt.findOneAndUpdate(
    { _id: attempt._id, status: 'active' },
    {
      $set: { status: 'completed', result, finishedAt: result.completedAt },
      $unset: { expiresAt: '' },
    },
    { new: true, lean: true },
  );

  if (!completed) {
    const latest = await Attempt.findById(attemptId).lean();
    if (latest?.status === 'completed') return buildResponse(latest);
    throw new AppError(409, 'ATTEMPT_NOT_ACTIVE', 'This attempt is not active');
  }

  await saveProgress(completed);
  return buildResponse(completed);
}