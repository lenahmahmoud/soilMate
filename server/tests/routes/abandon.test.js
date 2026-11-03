import request from 'supertest';
import mongoose from 'mongoose';
import { jest } from '@jest/globals';
import { v4 as uuidv4 } from 'uuid';
import { startTestApp } from '../helpers/testApp.js';
import { createClient, keysFor, completeRound } from '../helpers/play.js';
import Attempt from '../../src/models/Attempt.js';
import Player from '../../src/models/Player.js';
import Progress from '../../src/models/Progress.js';
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

describe('POST /api/attempts/:attemptId/abandon', () => {
  test('abandons an active attempt', async () => {
    const { client, attempt } = await begin('crop-superpowers');

    const res = await client.abandon(attempt.attemptId);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body).toEqual({ status: 'abandoned' });
    const saved = await Attempt.findById(attempt.attemptId).lean();
    expect(saved.status).toBe('abandoned');
    expect(saved.finishedAt).toBeInstanceOf(Date);
    expect((await client.resume('crop-superpowers')).status).toBe(404);
  });

  test('abandoning does not change QuestionHistory', async () => {
    const { client, attempt, questions } = await begin('crop-superpowers');
    const { correct } = await keysFor(questions[0]);
    await client.answer(attempt.attemptId, questions[0].id, correct);
    const before = await QuestionHistory.find().lean();

    await client.abandon(attempt.attemptId);

    expect(before).toHaveLength(1);
    expect(await QuestionHistory.find().lean()).toEqual(before);
  });

  test('an abandoned attempt rejects answer, skip and complete with 409', async () => {
    const { client, attempt, questions } = await begin('crop-superpowers');
    const { correct } = await keysFor(questions[0]);
    await client.abandon(attempt.attemptId);

    const results = [
      await client.answer(attempt.attemptId, questions[0].id, correct),
      await client.skip(attempt.attemptId, questions[1].id),
      await client.complete(attempt.attemptId),
    ];
    for (const res of results) {
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ATTEMPT_NOT_ACTIVE');
    }
  });

  test('a completed attempt is left unchanged', async () => {
    const client = newClient();
    const done = await completeRound(client, 'fix-the-field');
    const id = done.body.attemptId;

    const res = await client.abandon(id);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'abandoned' });
    const saved = await Attempt.findById(id).lean();
    expect(saved.status).toBe('completed');
    expect(saved.result.score).toBe(6);
  });

  test('abandoning twice is fine', async () => {
    const { client, attempt } = await begin('crop-superpowers');
    const first = await client.abandon(attempt.attemptId);
    const second = await client.abandon(attempt.attemptId);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body).toEqual({ status: 'abandoned' });
  });

  test('another player gets 403, an unknown attempt 404, bad input 400', async () => {
    const { client, attempt } = await begin('crop-superpowers');

    const intruder = await newClient().abandon(attempt.attemptId);
    expect(intruder.status).toBe(403);
    expect(intruder.body.error.code).toBe('FORBIDDEN');
    expect((await Attempt.findById(attempt.attemptId).lean()).status).toBe('active');

    const unknown = await client.abandon(new mongoose.Types.ObjectId().toString());
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('NOT_FOUND');

    const malformed = await client.abandon('abc');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');

    const extra = await request(ctx.app)
      .post(`/api/attempts/${attempt.attemptId}/abandon`)
      .set('X-Player-Id', client.playerId)
      .send({ anything: 1 });
    expect(extra.status).toBe(400);
    expect(extra.body.error.code).toBe('VALIDATION_ERROR');
  });
});