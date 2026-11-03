import request from 'supertest';
import Question from '../../src/models/Question.js';

export function createClient(app, playerId) {
  const withPlayer = (req) => req.set('X-Player-Id', playerId);
  const post = (url) => withPlayer(request(app).post(url));
  const get = (url) => withPlayer(request(app).get(url));

  return {
    playerId,
    start: (slug) => post(`/api/games/${slug}/attempts`),
    resume: (slug) => get(`/api/games/${slug}/attempts/current`),
    answer: (attemptId, questionId, choiceKey) =>
      post(`/api/attempts/${attemptId}/answer`).send({ questionId, choiceKey }),
    skip: (attemptId, questionId) =>
      post(`/api/attempts/${attemptId}/skip`).send({ questionId }),
    complete: (attemptId) => post(`/api/attempts/${attemptId}/complete`),
    abandon: (attemptId) => post(`/api/attempts/${attemptId}/abandon`),
    games: () => get('/api/games'),
    progress: () => get('/api/players/me/progress'),
    reset: () => post('/api/players/me/reset'),
  };
}

// The tests may read the right answer straight from the database.
export async function keysFor(question) {
  const stored = await Question.findById(question.id).select('+correctChoiceKey').lean();
  const correct = stored.correctChoiceKey;
  return { correct, wrong: question.choices.map((c) => c.key).filter((k) => k !== correct) };
}

// First `score` questions correct on the first try, the rest skipped.
export const scorePlan = (total, score) =>
  Array.from({ length: total }, (_, i) => (i < score ? 'correct' : 'skip'));

// plan: 'correct' for every question, or one of 'correct' | 'skip' | 'wrong-then-correct' per question.
export async function playRound(client, slug, plan = 'correct') {
  const started = await client.start(slug);
  const attempt = started.body;

  for (let i = 0; i < attempt.questions.length; i += 1) {
    const question = attempt.questions[i];
    const step = Array.isArray(plan) ? plan[i] : plan;
    const { correct, wrong } = await keysFor(question);

    if (step === 'skip') {
      await client.skip(attempt.attemptId, question.id);
    } else if (step === 'wrong-then-correct') {
      await client.answer(attempt.attemptId, question.id, wrong[0]);
      await client.answer(attempt.attemptId, question.id, correct);
    } else {
      await client.answer(attempt.attemptId, question.id, correct);
    }
  }
  return attempt;
}

export async function completeRound(client, slug, plan = 'correct') {
  const attempt = await playRound(client, slug, plan);
  return client.complete(attempt.attemptId);
}