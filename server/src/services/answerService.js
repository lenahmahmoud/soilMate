// server/src/services/attempt.service.js
import Attempt from '../models/Attempt.js';
import Question from '../models/Question.js';
import QuestionHistory from '../models/QuestionHistory.js';
import { AppError } from '../utils/AppError.js';
import { assertAttemptOwner } from '../utils/ownership.js';
import { POINTS_PER_FIRST_TRY } from '../utils/scoring.js';
import { toAnswerResponse, toSkipResponse } from '../mappers/attemptMappers.js';
import { logger } from '../config/logger.js';

const MAX_TRIES = 8;

async function loadActiveAttempt(attemptId, playerId) {
  const attempt = await Attempt.findById(attemptId).lean();
  assertAttemptOwner(attempt, playerId);
  if (attempt.status !== 'active') {
    throw new AppError(409, 'ATTEMPT_NOT_ACTIVE', 'This attempt is not active');
  }
  return attempt;
}

function findOpenQuestion(attempt, questionId) {
  const aq = attempt.questions.find((q) => String(q.questionId) === questionId);
  if (!aq) {
    throw new AppError(400, 'QUESTION_NOT_IN_ATTEMPT', 'This question is not part of the attempt');
  }
  if (aq.resolved) {
    throw new AppError(409, 'QUESTION_ALREADY_RESOLVED', 'This question is already resolved');
  }
  return aq;
}

const loadQuestion = async (questionId) => {
  const question = await Question.findById(questionId)
    .select('+correctChoiceKey +explanation')
    .lean();
  if (!question) throw new AppError(500, 'INTERNAL', 'Question data is missing');
  return question;
};

// The write only applies if nothing changed since we read the attempt. If it returns null,
// another request got there first and the caller reads the attempt again.
function guard(attempt, aq, extra = {}) {
  return {
    _id: attempt._id,
    status: 'active',
    hearts: attempt.hearts,
    streak: attempt.streak,
    points: attempt.points,
    questions: { $elemMatch: { questionId: aq.questionId, resolved: false, ...extra } },
  };
}

const writeOptions = (aq) => ({
  arrayFilters: [{ 'q.questionId': aq.questionId }],
  returnDocument: 'after',
  lean: true,
});

async function recordSeen(playerId, gameSlug, questionId, now) {
  try {
    await QuestionHistory.updateOne(
      { playerId, questionId },
      { $inc: { timesSeen: 1 }, $set: { gameSlug, lastSeenAt: now } },
      { upsert: true, setDefaultsOnInsert: false },
    );
  } catch (err) {
    // The answer is already saved, so a history problem must not fail the request.
    logger.error({ err }, 'Could not update question history');
  }
}

function correctStep(attempt, aq, now) {
  const firstTry = aq.wrongCount === 0;
  const pointsEarned = firstTry ? POINTS_PER_FIRST_TRY : 0;
  const streak = firstTry ? attempt.streak + 1 : attempt.streak;
  return {
    firstTry,
    pointsEarned,
    update: {
      $set: {
        streak,
        points: attempt.points + pointsEarned,
        'questions.$[q].resolved': true,
        'questions.$[q].resolvedAt': now,
        'questions.$[q].firstTryCorrect': firstTry,
      },
      $max: { bestStreak: streak },
    },
  };
}

function wrongStep(attempt, choiceKey, now) {
  const hearts = attempt.hearts - 1;
  const set = { hearts, streak: 0 };
  const update = {
    $set: set,
    $inc: { 'questions.$[q].wrongCount': 1 },
    $addToSet: { 'questions.$[q].wrongChoiceKeys': choiceKey },
  };
  if (hearts <= 0) {
    // Same atomic update: the attempt fails and stops expiring (only active or abandoned expire).
    set.status = 'failed';
    set.finishedAt = now;
    update.$unset = { expiresAt: '' };
  }
  return { firstTry: false, pointsEarned: 0, update };
}

export async function answerQuestion({ attemptId, playerId, questionId, choiceKey }) {
  let question = null;

  for (let i = 0; i < MAX_TRIES; i += 1) {
    const attempt = await loadActiveAttempt(attemptId, playerId);
    const aq = findOpenQuestion(attempt, questionId);

    if (!aq.choices.some((c) => c.key === choiceKey)) {
      throw new AppError(400, 'VALIDATION_ERROR', 'Invalid request', {
        issues: [{ path: 'body.choiceKey', message: 'is not one of the choices of this question' }],
      });
    }

    question ??= await loadQuestion(questionId);
    const correct = choiceKey === question.correctChoiceKey;

    // The same wrong choice sent again does not cost another heart.
    if (!correct && (aq.wrongChoiceKeys ?? []).includes(choiceKey)) {
      return toAnswerResponse({ correct: false, firstTry: false, pointsEarned: 0, attempt, question });
    }

    const now = new Date();
    const step = correct ? correctStep(attempt, aq, now) : wrongStep(attempt, choiceKey, now);
    const updated = await Attempt.findOneAndUpdate(
      guard(attempt, aq, { wrongCount: aq.wrongCount }),
      step.update,
      writeOptions(aq),
    );
    if (!updated) continue;

    if (correct) await recordSeen(playerId, attempt.gameSlug, aq.questionId, now);

    return toAnswerResponse({
      correct,
      firstTry: step.firstTry,
      pointsEarned: step.pointsEarned,
      attempt: updated,
      question,
    });
  }

  throw new AppError(500, 'INTERNAL', 'Could not save the answer. Please try again.');
}

export async function skipQuestion({ attemptId, playerId, questionId }) {
  let question = null;

  for (let i = 0; i < MAX_TRIES; i += 1) {
    const attempt = await loadActiveAttempt(attemptId, playerId);
    const aq = findOpenQuestion(attempt, questionId);
    question ??= await loadQuestion(questionId);

    const now = new Date();
    const updated = await Attempt.findOneAndUpdate(
      guard(attempt, aq),
      {
        $set: {
          streak: 0,
          'questions.$[q].resolved': true,
          'questions.$[q].skipped': true,
          'questions.$[q].resolvedAt': now,
        },
      },
      writeOptions(aq),
    );
    if (!updated) continue;

    await recordSeen(playerId, attempt.gameSlug, aq.questionId, now);
    return toSkipResponse({ attempt: updated, question });
  }

  throw new AppError(500, 'INTERNAL', 'Could not skip the question. Please try again.');
}

// Only an active attempt changes. Any other attempt is left exactly as it is.
// QuestionHistory is never touched, so an abandoned round does not use up questions.
export async function abandonAttempt({ attemptId, playerId }) {
  const attempt = await Attempt.findById(attemptId).select('playerId status').lean();
  assertAttemptOwner(attempt, playerId);

  await Attempt.updateOne(
    { _id: attempt._id, status: 'active' },
    { $set: { status: 'abandoned', finishedAt: new Date() } },
  );
  return { status: 'abandoned' };
}