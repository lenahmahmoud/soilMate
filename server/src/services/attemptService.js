import Attempt from '../models/Attempt.js';
import Question from '../models/Question.js';
import { env } from '../config/env.js';
import { GAME_SLUGS } from '../constants/enums.js';
import { AppError } from '../utils/AppError.js';
import { pickQuestions } from './picker.service.js';
import { toQuestionForPlay, toAttemptState } from '../mappers/attemptMappers.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function assertKnownSlug(gameSlug) {
  if (!GAME_SLUGS.includes(gameSlug)) {
    throw new AppError(404, 'NOT_FOUND', 'Game not found');
  }
}

export async function startAttempt(gameSlug, playerId) {
  assertKnownSlug(gameSlug);

  // Pick first: if it fails, the player keeps the round they already have.
  // The picker does not touch QuestionHistory.
  const picked = await pickQuestions(gameSlug, playerId);

  const startedAt = new Date();
  await Attempt.updateMany(
    { playerId, gameSlug, status: 'active' },
    { $set: { status: 'abandoned', finishedAt: startedAt } },
  );

  const attempt = await Attempt.create({
    playerId,
    gameSlug,
    status: 'active',
    hearts: 3,
    streak: 0,
    bestStreak: 0,
    points: 0,
    total: picked.length,
    questions: picked.map(({ question, position, choices }) => ({
      questionId: question._id,
      position,
      choices,
    })),
    startedAt,
    expiresAt: new Date(startedAt.getTime() + env.ATTEMPT_TTL_DAYS * DAY_MS),
  });

  const doc = attempt.toObject();
  const questions = picked.map(({ question }, i) => toQuestionForPlay(question, doc.questions[i]));
  return toAttemptState(doc, questions);
}

export async function getCurrentAttempt(gameSlug, playerId) {
  assertKnownSlug(gameSlug);

  // If two active attempts ever exist, the newest one is the current one.
  const attempt = await Attempt.findOne({ playerId, gameSlug, status: 'active' })
    .sort({ startedAt: -1 })
    .lean();
  if (!attempt) throw new AppError(404, 'NOT_FOUND', 'No active attempt for this game');

  // correctChoiceKey and explanation are select: false, so they are not loaded here.
  const docs = await Question.find({
    _id: { $in: attempt.questions.map((q) => q.questionId) },
  }).lean();
  const byId = new Map(docs.map((q) => [String(q._id), q]));

  const questions = [...attempt.questions]
    .sort((a, b) => a.position - b.position)
    .map((attemptQuestion) => {
      const question = byId.get(String(attemptQuestion.questionId));
      if (!question) throw new AppError(500, 'INTERNAL', 'A question of this attempt is missing');
      return toQuestionForPlay(question, attemptQuestion, { withState: true });
    });

  return toAttemptState(attempt, questions);
}