import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { startTestApp } from '../helpers/testApp.js';
import { GAME_SLUGS } from '../../src/constants/enums.js';
import Attempt from '../../src/models/Attempt.js';
import Question from '../../src/models/Question.js';
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

const start = (slug, playerId) => {
  const req = request(ctx.app).post(`/api/games/${slug}/attempts`);
  return playerId ? req.set('X-Player-Id', playerId) : req;
};

const FORBIDDEN = [
  'correctChoiceKey',
  'explanation',
  'Explanation ',
  'collectionItem',
  'illustrationFixedKey',
  'resultAnimationKey',
  '"group"',
];

describe('POST /api/games/:slug/attempts', () => {
  test('Game 1 returns 5 unique terms, each with the correct meaning plus 2 others', async () => {
    const res = await start('match-the-word');
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(5);
    expect(res.body.questions).toHaveLength(5);
    expect(new Set(res.body.questions.map((q) => q.key)).size).toBe(5);

    for (const q of res.body.questions) {
      const keys = q.choices.map((c) => c.key);
      expect(q.choices).toHaveLength(3);
      expect(new Set(keys).size).toBe(3);
      expect(new Set(q.choices.map((c) => c.label)).size).toBe(3);
      expect(keys).toContain(q.key);

      const stored = await Question.findOne({ key: q.key }).lean();
      const own = q.choices.find((c) => c.key === q.key);
      expect(own.label).toBe(stored.choices[0].label);
    }
  });

  test('returns only the documented fields and is not cacheable', async () => {
    const res = await start('crop-superpowers');
    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Object.keys(res.body).sort()).toEqual(
      ['attemptId', 'gameSlug', 'status', 'hearts', 'streak', 'points', 'total', 'questions'].sort(),
    );
    expect(res.body).toMatchObject({
      gameSlug: 'crop-superpowers',
      status: 'active',
      hearts: 3,
      streak: 0,
      points: 0,
      total: 6,
    });
    expect(res.body.attemptId).toMatch(/^[0-9a-f]{24}$/);

    const allowed = ['id', 'key', 'position', 'prompt', 'subtitle', 'illustrationKey', 'choices'];
    for (const q of res.body.questions) {
      expect(q.id).toMatch(/^[0-9a-f]{24}$/);
      expect(Object.keys(q).every((k) => allowed.includes(k))).toBe(true);
      for (const c of q.choices) {
        expect(Object.keys(c).sort()).toEqual(['iconKey', 'key', 'label']);
      }
    }
  });

  test('Games 2 to 5 return 6 unique questions in position order', async () => {
    for (const slug of GAME_SLUGS.slice(1)) {
      const res = await start(slug);
      expect(res.status).toBe(201);
      expect(res.body.total).toBe(6);
      expect(res.body.questions.map((q) => q.position)).toEqual([1, 2, 3, 4, 5, 6]);
      expect(new Set(res.body.questions.map((q) => q.key)).size).toBe(6);
      for (const q of res.body.questions) expect(q.choices).toHaveLength(3);
    }
  });

  test('Game 2 has 2 questions per group and fixed choice order', async () => {
    for (let round = 0; round < 5; round += 1) {
      const res = await start('satellite-or-ground');
      const stored = await Question.find({
        key: { $in: res.body.questions.map((q) => q.key) },
      }).lean();
      const counts = { satellite: 0, both: 0, ground: 0 };
      for (const q of stored) counts[q.group] += 1;
      expect(counts).toEqual({ satellite: 2, both: 2, ground: 2 });

      for (const q of res.body.questions) {
        expect(q.choices.map((c) => c.key)).toEqual(['satellite', 'both', 'ground']);
      }
    }
  });

  test('Game 3 has 6 different power groups', async () => {
    for (let round = 0; round < 5; round += 1) {
      const res = await start('crop-superpowers');
      const stored = await Question.find({
        key: { $in: res.body.questions.map((q) => q.key) },
      }).lean();
      expect(new Set(stored.map((q) => q.group)).size).toBe(6);
    }
  });

  test('never leaks answers, explanations, collection items or scene keys', async () => {
    for (const slug of GAME_SLUGS) {
      const res = await start(slug);
      const text = JSON.stringify(res.body);
      for (const word of FORBIDDEN) expect(text).not.toContain(word);
    }
  });

  test('saves the attempt with the same order and choices, an expiry, and no history', async () => {
    const playerId = uuidv4();
    const res = await start('crop-superpowers', playerId);
    const saved = await Attempt.findById(res.body.attemptId).lean();

    expect(saved.playerId).toBe(playerId);
    expect(saved.status).toBe('active');
    expect(saved.bestStreak).toBe(0);
    expect(saved.questions.map((q) => String(q.questionId))).toEqual(
      res.body.questions.map((q) => q.id),
    );
    expect(saved.questions.map((q) => q.choices.map((c) => c.key))).toEqual(
      res.body.questions.map((q) => q.choices.map((c) => c.key)),
    );
    expect(
      saved.questions.every(
        (q) =>
          !q.resolved &&
          !q.skipped &&
          !q.firstTryCorrect &&
          q.wrongCount === 0 &&
          q.wrongChoiceKeys.length === 0,
      ),
    ).toBe(true);
    expect(saved.expiresAt.getTime() - saved.startedAt.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(await QuestionHistory.countDocuments()).toBe(0);
  });

  test('starting again abandons only the previous active attempt of the same player and game', async () => {
    const a = uuidv4();
    const b = uuidv4();
    const first = await start('match-the-word', a);
    const otherGame = await start('fix-the-field', a);
    const otherPlayer = await start('match-the-word', b);
    const second = await start('match-the-word', a);

    const status = async (id) => (await Attempt.findById(id).lean()).status;
    expect(await status(first.body.attemptId)).toBe('abandoned');
    expect(await status(second.body.attemptId)).toBe('active');
    expect(await status(otherGame.body.attemptId)).toBe('active');
    expect(await status(otherPlayer.body.attemptId)).toBe('active');

    const abandoned = await Attempt.findById(first.body.attemptId).lean();
    expect(abandoned.finishedAt).toBeInstanceOf(Date);
    expect(
      await Attempt.countDocuments({ playerId: a, gameSlug: 'match-the-word', status: 'active' }),
    ).toBe(1);
  });

  test('an unknown slug is 404 and a malformed slug is 400', async () => {
    const unknown = await start('no-such-game');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('NOT_FOUND');

    const malformed = await start('Bad_Slug');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('accepts an empty object body and rejects unknown body fields', async () => {
    const empty = await start('match-the-word').send({});
    expect(empty.status).toBe(201);

    const extra = await start('match-the-word').send({ hearts: 99 });
    expect(extra.status).toBe(400);
    expect(extra.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('without a player header a player is created and owns the attempt', async () => {
    const res = await start('match-the-word');
    const id = res.headers['x-player-id'];
    expect(id).toHaveLength(36);
    expect((await Attempt.findById(res.body.attemptId).lean()).playerId).toBe(id);
    expect(await Player.findById(id).lean()).not.toBeNull();
  });
});