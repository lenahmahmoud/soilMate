import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { startTestApp } from '../helpers/testApp.js';
import { GAME_SLUGS } from '../../src/constants/enums.js';
import Attempt from '../../src/models/Attempt.js';
import QuestionHistory from '../../src/models/QuestionHistory.js';
import Player from '../../src/models/Player.js';

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
    Player.deleteMany({}),
  ]);
});

const withPlayer = (req, playerId) => (playerId ? req.set('X-Player-Id', playerId) : req);
const start = (slug, playerId) =>
  withPlayer(request(ctx.app).post(`/api/games/${slug}/attempts`), playerId);
const resume = (slug, playerId) =>
  withPlayer(request(ctx.app).get(`/api/games/${slug}/attempts/current`), playerId);

const FORBIDDEN = [
  'correctChoiceKey',
  'explanation',
  'Explanation ',
  'collectionItem',
  'illustrationFixedKey',
  'resultAnimationKey',
  '"group"',
];

describe('GET /api/games/:slug/attempts/current', () => {
  test('404 NOT_FOUND when there is no active attempt', async () => {
    const res = await resume('match-the-word', uuidv4());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('returns the same attempt, questions, order and choices as when it started', async () => {
    const id = uuidv4();
    const started = await start('fix-the-field', id);
    const resumed = await resume('fix-the-field', id);

    expect(resumed.status).toBe(200);
    expect(resumed.headers['cache-control']).toBe('no-store');
    expect(resumed.body).toEqual({
      ...started.body,
      questions: started.body.questions.map((q) => ({
        ...q,
        resolved: false,
        wrongChoiceKeys: [],
      })),
    });
  });

  test('restores hearts, streak, points, resolved questions and wrong choices', async () => {
    const id = uuidv4();
    const started = await start('crop-superpowers', id);
    await Attempt.updateOne(
      { _id: started.body.attemptId },
      {
        $set: {
          hearts: 2,
          streak: 0,
          points: 10,
          'questions.0.resolved': true,
          'questions.1.wrongChoiceKeys': ['b'],
        },
      },
    );

    const res = await resume('crop-superpowers', id);
    expect(res.body).toMatchObject({ status: 'active', hearts: 2, streak: 0, points: 10 });
    expect(res.body.questions[0].resolved).toBe(true);
    expect(res.body.questions[1].resolved).toBe(false);
    expect(res.body.questions[1].wrongChoiceKeys).toEqual(['b']);
    expect(res.body.questions[2].wrongChoiceKeys).toEqual([]);
  });

  test('never leaks answers, explanations, collection items or scene keys', async () => {
    const id = uuidv4();
    for (const slug of GAME_SLUGS) {
      await start(slug, id);
      const res = await resume(slug, id);
      const text = JSON.stringify(res.body);
      for (const word of FORBIDDEN) expect(text).not.toContain(word);
    }
  });

  test('ignores abandoned, failed and completed attempts', async () => {
    const id = uuidv4();
    for (const status of ['abandoned', 'failed', 'completed']) {
      const started = await start('match-the-word', id);
      await Attempt.updateOne({ _id: started.body.attemptId }, { $set: { status } });
      expect((await resume('match-the-word', id)).status).toBe(404);
      await Attempt.deleteMany({});
    }
  });

  test('another player has no current attempt', async () => {
    await start('match-the-word', uuidv4());
    const res = await resume('match-the-word', uuidv4());
    expect(res.status).toBe(404);
  });

  test('returns the newest active attempt if two exist', async () => {
    const id = uuidv4();
    const first = await start('match-the-word', id);
    const doc = await Attempt.findById(first.body.attemptId).lean();
    delete doc._id;
    delete doc.__v;
    const second = await Attempt.create({ ...doc, startedAt: new Date(Date.now() + 1000) });

    const res = await resume('match-the-word', id);
    expect(res.body.attemptId).toBe(String(second._id));
  });

  test('an unknown slug is 404 and a malformed slug is 400', async () => {
    const unknown = await resume('no-such-game');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('NOT_FOUND');

    const malformed = await resume('Bad_Slug');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
  });
});