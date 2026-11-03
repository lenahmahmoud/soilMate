import request from 'supertest';
import mongoose from 'mongoose';
import { jest } from '@jest/globals';
import { v4 as uuidv4 } from 'uuid';
import { startTestApp } from '../helpers/testApp.js';
import { createClient, keysFor } from '../helpers/play.js';
import { GAME_SLUGS } from '../../src/constants/enums.js';
import Attempt from '../../src/models/Attempt.js';
import Player from '../../src/models/Player.js';
import Progress from '../../src/models/Progress.js';
import Question from '../../src/models/Question.js';
import QuestionHistory from '../../src/models/QuestionHistory.js';

jest.setTimeout(30000);

let ctx;

beforeAll(async () => {
  ctx = await startTestApp();
}, 60000);

afterAll(async () => {
  await ctx.stop();
});

afterEach(async () => {
  await Promise.all([
    Attempt.deleteMany({}),
    QuestionHistory.deleteMany({}),
    Progress.deleteMany({}),
    Player.deleteMany({}),
  ]);
});

const newClient = () => createClient(ctx.app, uuidv4());

async function begin(slug, client = newClient()) {
  const res = await client.start(slug);
  return { client, attempt: res.body, questions: res.body.questions };
}

const sorted = (list) => [...list].sort();
const randomId = () => new mongoose.Types.ObjectId().toString();

const CORRECT_KEYS = [
  'correct',
  'correctChoiceKey',
  'explanation',
  'firstTry',
  'pointsEarned',
  'hearts',
  'streak',
  'totalPoints',
  'attemptStatus',
  'allResolved',
];

describe('POST /api/attempts/:attemptId/answer', () => {
  test('a correct first try gives 10 points, +1 streak and the collection item', async () => {
    const { client, attempt, questions } = await begin('crop-superpowers');
    const { correct } = await keysFor(questions[0]);

    const res = await client.answer(attempt.attemptId, questions[0].id, correct);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(sorted(Object.keys(res.body))).toEqual(sorted([...CORRECT_KEYS, 'collectionItem']));
    expect(res.body).toMatchObject({
      correct: true,
      correctChoiceKey: 'a',
      firstTry: true,
      pointsEarned: 10,
      hearts: 3,
      streak: 1,
      totalPoints: 10,
      attemptStatus: 'active',
      allResolved: false,
    });
    expect(res.body.explanation).toMatch(/^Explanation 3-/);
    expect(res.body.collectionItem).toMatchObject({ earned: true });
    expect(res.body.collectionItem.key).toMatch(/^power-/);

    const saved = await Attempt.findById(attempt.attemptId).lean();
    expect(saved).toMatchObject({ points: 10, streak: 1, bestStreak: 1, hearts: 3, status: 'active' });
    expect(saved.questions[0]).toMatchObject({
      resolved: true,
      firstTryCorrect: true,
      skipped: false,
      wrongCount: 0,
    });
    expect(saved.questions[0].resolvedAt).toBeInstanceOf(Date);
  });

  test('wrong then correct gives no points, keeps the streak at 0 and costs one heart', async () => {
    const { client, attempt, questions } = await begin('crop-superpowers');
    const { correct, wrong } = await keysFor(questions[0]);

    const first = await client.answer(attempt.attemptId, questions[0].id, wrong[0]);
    expect(first.body).toMatchObject({ correct: false, hearts: 2, streak: 0, totalPoints: 0 });

    const second = await client.answer(attempt.attemptId, questions[0].id, correct);
    expect(second.body).toMatchObject({
      correct: true,
      firstTry: false,
      pointsEarned: 0,
      hearts: 2,
      streak: 0,
      totalPoints: 0,
    });
    expect(second.body.collectionItem).toBeUndefined();

    const saved = await Attempt.findById(attempt.attemptId).lean();
    expect(saved.questions[0]).toMatchObject({
      resolved: true,
      firstTryCorrect: false,
      wrongCount: 1,
      wrongChoiceKeys: [wrong[0]],
    });
  });

  test('a wrong answer never reveals the answer, the explanation or scene keys (all 5 games)', async () => {
    const client = newClient();
    for (const slug of GAME_SLUGS) {
      const { attempt, questions } = await begin(slug, client);
      const { wrong } = await keysFor(questions[0]);

      const res = await client.answer(attempt.attemptId, questions[0].id, wrong[0]);

      expect(res.status).toBe(200);
      expect(sorted(Object.keys(res.body))).toEqual(
        sorted([
          'correct',
          'firstTry',
          'pointsEarned',
          'hearts',
          'streak',
          'totalPoints',
          'attemptStatus',
          'allResolved',
        ]),
      );
      expect(res.body).toMatchObject({
        correct: false,
        firstTry: false,
        pointsEarned: 0,
        hearts: 2,
        streak: 0,
        totalPoints: 0,
        attemptStatus: 'active',
        allResolved: false,
      });
    }
  });

  test('a wrong answer resets the streak and the best streak is kept', async () => {
    const { client, attempt, questions } = await begin('fix-the-field');
    const id = attempt.attemptId;
    const k = [];
    for (const q of questions) k.push(await keysFor(q));

    await client.answer(id, questions[0].id, k[0].correct);
    const second = await client.answer(id, questions[1].id, k[1].correct);
    expect(second.body.streak).toBe(2);

    const wrong = await client.answer(id, questions[2].id, k[2].wrong[0]);
    expect(wrong.body.streak).toBe(0);

    const retried = await client.answer(id, questions[2].id, k[2].correct);
    expect(retried.body).toMatchObject({
      firstTry: false,
      pointsEarned: 0,
      streak: 0,
      hearts: 2,
      totalPoints: 20,
    });
    expect(retried.body.collectionItem).toBeUndefined();

    const next = await client.answer(id, questions[3].id, k[3].correct);
    expect(next.body).toMatchObject({ streak: 1, totalPoints: 30 });

    const saved = await Attempt.findById(id).lean();
    expect(saved.bestStreak).toBe(2);
  });

  test('the same wrong choice costs one heart and resume restores wrongChoiceKeys', async () => {
    const { client, attempt, questions } = await begin('crop-superpowers');
    const id = attempt.attemptId;
    const { wrong } = await keysFor(questions[0]);

    const first = await client.answer(id, questions[0].id, wrong[0]);
    const again = await client.answer(id, questions[0].id, wrong[0]);
    expect(first.body.hearts).toBe(2);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ correct: false, hearts: 2 });

    const other = await client.answer(id, questions[0].id, wrong[1]);
    expect(other.body.hearts).toBe(1);

    const resumed = await client.resume('crop-superpowers');
    expect(resumed.body.hearts).toBe(1);
    expect(sorted(resumed.body.questions[0].wrongChoiceKeys)).toEqual(sorted(wrong));
    expect(resumed.body.questions[0].resolved).toBe(false);
    expect(resumed.body.questions[1].wrongChoiceKeys).toEqual([]);

    const saved = await Attempt.findById(id).lean();
    expect(saved.questions[0].wrongCount).toBe(2);
  });

  test('three wrong answers fail the attempt and block everything after', async () => {
    const { client, attempt, questions } = await begin('crop-superpowers');
    const id = attempt.attemptId;
    const k0 = await keysFor(questions[0]);
    const k1 = await keysFor(questions[1]);

    const r1 = await client.answer(id, questions[0].id, k0.wrong[0]);
    const r2 = await client.answer(id, questions[0].id, k0.wrong[1]);
    const r3 = await client.answer(id, questions[1].id, k1.wrong[0]);

    expect([r1, r2, r3].map((r) => r.body.hearts)).toEqual([2, 1, 0]);
    expect(r3.body.attemptStatus).toBe('failed');

    const saved = await Attempt.findById(id).lean();
    expect(saved).toMatchObject({ status: 'failed', hearts: 0 });
    expect(saved.finishedAt).toBeInstanceOf(Date);

    const later = [
      await client.answer(id, questions[1].id, k1.correct),
      await client.skip(id, questions[2].id),
      await client.complete(id),
    ];
    for (const res of later) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ATTEMPT_NOT_ACTIVE');
    }
    expect((await client.resume('crop-superpowers')).status).toBe(404);
  });

  test('answering a resolved question returns 409 QUESTION_ALREADY_RESOLVED', async () => {
    const { client, attempt, questions } = await begin('crop-superpowers');
    const { correct, wrong } = await keysFor(questions[0]);
    await client.answer(attempt.attemptId, questions[0].id, correct);

    const again = await client.answer(attempt.attemptId, questions[0].id, correct);
    const wrongAfter = await client.answer(attempt.attemptId, questions[0].id, wrong[0]);

    for (const res of [again, wrongAfter]) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('QUESTION_ALREADY_RESOLVED');
    }
    const saved = await Attempt.findById(attempt.attemptId).lean();
    expect(saved).toMatchObject({ points: 10, hearts: 3 });
  });

  test('a question that is not in the attempt returns 400 QUESTION_NOT_IN_ATTEMPT', async () => {
    const { client, attempt, questions } = await begin('crop-superpowers');
    const other = await Question.findOne({
      gameSlug: 'crop-superpowers',
      _id: { $nin: questions.map((q) => q.id) },
    }).lean();

    const res = await client.answer(attempt.attemptId, String(other._id), 'a');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('QUESTION_NOT_IN_ATTEMPT');
  });

  test('a choiceKey that is not one of the question choices returns 400 and costs nothing', async () => {
    const { client, attempt, questions } = await begin('crop-superpowers');

    const res = await client.answer(attempt.attemptId, questions[0].id, 'zzz');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');

    const saved = await Attempt.findById(attempt.attemptId).lean();
    expect(saved.hearts).toBe(3);
    expect(saved.questions[0].wrongCount).toBe(0);
  });

  test('bad input is rejected with 400 VALIDATION_ERROR and changes nothing', async () => {
    const { client, attempt, questions } = await begin('crop-superpowers');
    const url = `/api/attempts/${attempt.attemptId}/answer`;
    const q = questions[0].id;
    const bodies = [
      {},
      { questionId: q },
      { choiceKey: 'a' },
      { questionId: q, choiceKey: 'A B' },
      { questionId: 'nope', choiceKey: 'a' },
      { questionId: q, choiceKey: 'a', extra: true },
    ];

    for (const body of bodies) {
      const res = await request(ctx.app).post(url).set('X-Player-Id', client.playerId).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }

    const badId = await client.answer('abc', q, 'a');
    expect(badId.status).toBe(400);
    expect(badId.body.error.code).toBe('VALIDATION_ERROR');

    const saved = await Attempt.findById(attempt.attemptId).lean();
    expect(saved.hearts).toBe(3);
    expect(saved.questions.every((x) => !x.resolved && x.wrongCount === 0)).toBe(true);
  });

  test('two parallel correct answers for the same question add points only once', async () => {
    const { client, attempt, questions } = await begin('fix-the-field');
    const { correct } = await keysFor(questions[0]);

    const [a, b] = await Promise.all([
      client.answer(attempt.attemptId, questions[0].id, correct),
      client.answer(attempt.attemptId, questions[0].id, correct),
    ]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    expect(loser.body.error.code).toBe('QUESTION_ALREADY_RESOLVED');

    const saved = await Attempt.findById(attempt.attemptId).lean();
    expect(saved).toMatchObject({ points: 10, streak: 1, bestStreak: 1 });
    const rows = await QuestionHistory.find().lean();
    expect(rows).toHaveLength(1);
    expect(rows[0].timesSeen).toBe(1);
  });

  test('parallel correct answers for different questions both count', async () => {
    const { client, attempt, questions } = await begin('fix-the-field');
    const k0 = await keysFor(questions[0]);
    const k1 = await keysFor(questions[1]);

    const [a, b] = await Promise.all([
      client.answer(attempt.attemptId, questions[0].id, k0.correct),
      client.answer(attempt.attemptId, questions[1].id, k1.correct),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body.firstTry && b.body.firstTry).toBe(true);
    const saved = await Attempt.findById(attempt.attemptId).lean();
    expect(saved).toMatchObject({ points: 20, streak: 2, bestStreak: 2 });
    expect(saved.questions[0].resolved && saved.questions[1].resolved).toBe(true);
  });

  test('a correct answer returns the after-scene keys only where the question has them', async () => {
    const client = newClient();
    const correctAnswer = async (slug) => {
      const { attempt, questions } = await begin(slug, client);
      const { correct } = await keysFor(questions[0]);
      return (await client.answer(attempt.attemptId, questions[0].id, correct)).body;
    };

    const g2 = await correctAnswer('satellite-or-ground');
    expect(sorted(Object.keys(g2))).toEqual(sorted(CORRECT_KEYS));

    const g4 = await correctAnswer('fix-the-field');
    expect(g4.illustrationFixedKey).toBe('fix-fixed');
    expect(g4.resultAnimationKey).toBeUndefined();
    expect(g4.collectionItem.key).toMatch(/^tile-/);

    const g5 = await correctAnswer('weather-and-crops');
    expect(g5.resultAnimationKey).toBe('anim-hot');
    expect(g5.illustrationFixedKey).toBeUndefined();
    expect(g5.collectionItem.key).toMatch(/^sticker-/);
  });

  test('Game 1 accepts the term key as the correct choice and returns its explanation', async () => {
    const { client, attempt, questions } = await begin('match-the-word');
    const q = questions[0];

    const res = await client.answer(attempt.attemptId, q.id, q.key);

    const stored = await Question.findById(q.id).select('+explanation').lean();
    expect(res.body).toMatchObject({ correct: true, correctChoiceKey: q.key, firstTry: true });
    expect(res.body.explanation).toBe(stored.explanation);
    expect(res.body.collectionItem).toEqual({
      key: stored.collectionItem.key,
      label: stored.collectionItem.label,
      iconKey: stored.collectionItem.iconKey,
      earned: true,
    });
  });

  test('answering the last question sets allResolved and keeps the attempt active', async () => {
    const { client, attempt, questions } = await begin('fix-the-field');
    let last;
    for (const q of questions) {
      const { correct } = await keysFor(q);
      last = await client.answer(attempt.attemptId, q.id, correct);
    }
    expect(last.body).toMatchObject({
      allResolved: true,
      attemptStatus: 'active',
      totalPoints: 60,
      streak: 6,
    });
  });

  test('QuestionHistory changes only when a question is resolved', async () => {
    const { client, attempt, questions } = await begin('crop-superpowers');
    const { correct, wrong } = await keysFor(questions[0]);

    await client.answer(attempt.attemptId, questions[0].id, wrong[0]);
    expect(await QuestionHistory.countDocuments()).toBe(0);

    await client.answer(attempt.attemptId, questions[0].id, correct);
    const rows = await QuestionHistory.find().lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      playerId: client.playerId,
      gameSlug: 'crop-superpowers',
      timesSeen: 1,
    });
    expect(String(rows[0].questionId)).toBe(questions[0].id);
    expect(rows[0].lastSeenAt).toBeInstanceOf(Date);
  });

  test('another player gets 403 FORBIDDEN and nothing changes', async () => {
    const { attempt, questions } = await begin('crop-superpowers');
    const intruder = newClient();
    const { correct } = await keysFor(questions[0]);

    const res = await intruder.answer(attempt.attemptId, questions[0].id, correct);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');

    const saved = await Attempt.findById(attempt.attemptId).lean();
    expect(saved.points).toBe(0);
    expect(saved.questions[0].resolved).toBe(false);
  });

  test('an unknown attempt is 404 NOT_FOUND', async () => {
    const res = await newClient().answer(randomId(), randomId(), 'a');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});