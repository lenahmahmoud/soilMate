const toChoice = ({ key, label, iconKey }) => ({ key, label, iconKey });

// Whitelist: nothing else from the Question document can reach the client.
export function toQuestionForPlay(question, attemptQuestion, { withState = false } = {}) {
  const out = {
    id: String(question._id),
    key: question.key,
    position: attemptQuestion.position,
    prompt: question.prompt,
  };
  if (question.subtitle) out.subtitle = question.subtitle;
  if (question.illustrationKey) out.illustrationKey = question.illustrationKey;
  out.choices = attemptQuestion.choices.map(toChoice);

  if (withState) {
    out.resolved = Boolean(attemptQuestion.resolved);
    out.wrongChoiceKeys = [...(attemptQuestion.wrongChoiceKeys ?? [])];
  }
  return out;
}

export function toAttemptState(attempt, questions) {
  return {
    attemptId: String(attempt._id),
    gameSlug: attempt.gameSlug,
    status: attempt.status,
    hearts: attempt.hearts,
    streak: attempt.streak,
    points: attempt.points,
    total: attempt.total,
    questions,
  };
}

const allResolved = (attempt) => attempt.questions.every((q) => q.resolved);

// The answer, explanation, collection item and scene keys appear ONLY when correct is true
// (the collection item only on a first try).
export function toAnswerResponse({ correct, firstTry, pointsEarned, attempt, question }) {
  const out = { correct };
  if (correct) {
    out.correctChoiceKey = question.correctChoiceKey;
    out.explanation = question.explanation;
  }
  out.firstTry = firstTry;
  out.pointsEarned = pointsEarned;
  out.hearts = attempt.hearts;
  out.streak = attempt.streak;
  out.totalPoints = attempt.points;
  out.attemptStatus = attempt.status;
  out.allResolved = allResolved(attempt);

  if (correct) {
    if (firstTry && question.collectionItem) {
      const { key, label, iconKey } = question.collectionItem;
      out.collectionItem = { key, label, iconKey, earned: true };
    }
    if (question.illustrationFixedKey) out.illustrationFixedKey = question.illustrationFixedKey;
    if (question.resultAnimationKey) out.resultAnimationKey = question.resultAnimationKey;
  }
  return out;
}

export function toSkipResponse({ attempt, question }) {
  return {
    correctChoiceKey: question.correctChoiceKey,
    explanation: question.explanation,
    hearts: attempt.hearts,
    streak: 0,
    totalPoints: attempt.points,
    attemptStatus: attempt.status,
    allResolved: allResolved(attempt),
  };
}