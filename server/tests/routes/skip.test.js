import request from 'supertest';
import mongoose from 'mongoose';
import { jest } from '@jest/globals';
import { v4 as uuidv4 } from 'uuid';
import { startTestApp } from '../helpers/testApp.js';
import { createClient, keysFor } from '../helpers/play.js';
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

const SKIP_KEYS = [
  'correctChoiceKey',
  'explanation',
  'hearts',
  'streak',
  'totalPoints',
  'attemptStatus',
  'allResolved',
];

describe('POST /api/attempts/:attemptId/skip', () => {
  test('skip loses no heart, earns nothing, resets the streak and reveals the answer', async () => {
    const { client, attempt, questions } = await begin('crop-superpowers');
    const id = attempt.attemptId;
    const k0 = await keysFor(questions[0]);
    await client.answer(id, questions[0].id, k0.correct);

    const res = await client.skip(id, questions[1].id);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(sorted(Object.keys(res.body))).toEqual(sorted(SKIP_KEYS));
    expect(res.body).toMatchObject({
      correctChoiceKey: 'a',
      hearts: 3,
      streak: 0,
      totalPoints: 10,
      attemptStatus: 'active',
      allResolved: false,
    });
    expect(res.body.explanation).toMatch(/^Explanation 3-/);

    const saved = await Attempt.findById(id).lean();
    expect(saved).toMatchObject({ hearts: 3, points: 10, streak: 0, bestStreak: 1 });
    expect(saved.questions[1]).toMatchObject({
      resolved: true,
      skipped: true,
      firstTryCorrect: false,
      wrongCount: 0,
    });
    expect(saved.questions[1].resolvedAt).toBeInstanceOf(Date);
  });

  test('skipping after a wrong answer keeps the hearts that were already lost', async () => {
    const { client, attempt, questions } = await begin('crop-superpowers');
    const id = attempt.attemptId;
    const { wrong } = await keysFor(questions[0]);
    await client.answer(id, questions[0].id, wrong[0]);

    const res = await client.skip(id, questions[0].id);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ hearts: 2, streak: 0, totalPoints: 0 });
    const saved = await Attempt.findById(id).lean();
    expect(saved.questions[0]).toMatchObject({ skipped: true, firstTryCorrect: false, wrongCount: 1 });
  });

  test('the skip response never contains scene keys or a collection item', async () => {
    const client = newClient();
    for (const slug of ['fix-the-field', 'weather-and-crops']) {
      const { attempt, questions } = await begin(slug, client);
      const res = await client.skip(attempt.attemptId, questions[0].id);
      expect(sorted(Object.keys(res.body))).toEqual(sorted(SKIP_KEYS));
      expect(res.body.illustrationFixedKey).toBeUndefined();
      expect(res.body.resultAnimationKey).toBeUndefined();
      expect(res.body.collectionItem).toBeUndefined();
    }
  });

  test('a skipped question is saved in QuestionHistory', async () => {
    const { client, attempt, questions } = await begin('crop-superpowers');
    await client.skip(attempt.attemptId, questions[0].id);

    const rows = await QuestionHistory.find().lean();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      playerId: client.playerId,
      gameSlug: 'crop-superpowers',
      timesSeen: 1,
    });
    expect(String(rows[0].questionId)).toBe(questions[0].id);
  });

  test('skipping a resolved question returns 409 QUESTION_ALREADY_RESOLVED', async () => {
    const { client, attempt, questions } = await begin('crop-superpowers');
    await client.skip(attempt.attemptId, questions[0].id);

    const again = await client.skip(attempt.attemptId, questions[0].id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('QUESTION_ALREADY_RESOLVED');
    expect(await QuestionHistory.countDocuments()).toBe(1);
  });

  test('a question that is not in the attempt returns 400 QUESTION_NOT_IN_ATTEMPT', async () => {
    const { client, attempt, questions } = await begin('crop-superpowers');
    const other = await Question.findOne({
      gameSlug: 'crop-superpowers',
      _id: { $nin: questions.map((q) => q.id) },
    }).lean();

    const res = await client.skip(attempt.attemptId, String(other._id));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('QUESTION_NOT_IN_ATTEMPT');
  });

  test('bad input is rejected with 400 VALIDATION_ERROR', async () => {
    const { client, attempt, questions } = await begin('crop-superpowers');
    const url = `/api/attempts/${attempt.attemptId}/skip`;
    const bodies = [{}, { questionId: 'nope' }, { questionId: questions[0].id, choiceKey: 'a' }];

    for (const body of bodies) {
      const res = await request(ctx.app).post(url).set('X-Player-Id', client.playerId).send(body);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
    const badId = await client.skip('abc', questions[0].id);
    expect(badId.status).toBe(400);

    const saved = await Attempt.findById(attempt.attemptId).lean();
    expect(saved.questions.every((q) => !q.resolved)).toBe(true);
  });

  test('another player gets 403 and an unknown attempt gets 404', async () => {
    const { attempt, questions } = await begin('crop-superpowers');

    const intruder = await newClient().skip(attempt.attemptId, questions[0].id);
    expect(intruder.status).toBe(403);
    expect(intruder.body.error.code).toBe('FORBIDDEN');

    const unknown = await newClient().skip(
      new mongoose.Types.ObjectId().toString(),
      questions[0].id,
    );
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('NOT_FOUND');

    const saved = await Attempt.findById(attempt.attemptId).lean();
    expect(saved.questions[0].resolved).toBe(false);
  });

  test('skipping every question sets allResolved with no points', async () => {
    const { client, attempt, questions } = await begin('fix-the-field');
    let last;
    for (const q of questions) last = await client.skip(attempt.attemptId, q.id);

    expect(last.body).toMatchObject({
      allResolved: true,
      attemptStatus: 'active',
      totalPoints: 0,
      streak: 0,
      hearts: 3,
    });
  });
});