import mongoose from 'mongoose';
import { jest } from '@jest/globals';
import { v4 as uuidv4 } from 'uuid';
import { startTestApp } from '../helpers/testApp.js';
import { createClient, keysFor, playRound, completeRound, scorePlan } from '../helpers/play.js';
import { GAME_SLUGS } from '../../src/constants/enums.js';
import Attempt from '../../src/models/Attempt.js';
import Player from '../../src/models/Player.js';
import Progress from '../../src/models/Progress.js';
import Question from '../../src/models/Question.js';
import QuestionHistory from '../../src/models/QuestionHistory.js';

jest.setTimeout(60000);

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
const sorted = (list) => [...list].sort();

const BASE_KEYS = [
  'attemptId',
  'gameSlug',
  'score',
  'total',
  'stars',
  'points',
  'bestStreak',
  'badge',
  'collection',
  'nextGame',
];

describe('POST /api/attempts/:attemptId/complete', () => {
  test('before every question is resolved it returns 409 ATTEMPT_NOT_FINISHED', async () => {
    const client = newClient();
    const started = await client.start('fix-the-field');
    const { attemptId, questions } = started.body;
    const { correct } = await keysFor(questions[0]);
    await client.answer(attemptId, questions[0].id, correct);

    const res = await client.complete(attemptId);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ATTEMPT_NOT_FINISHED');
    expect((await Attempt.findById(attemptId).lean()).status).toBe('active');
    expect(await Progress.countDocuments()).toBe(0);
  });

  test('an abandoned attempt returns 409 ATTEMPT_NOT_ACTIVE', async () => {
    const client = newClient();
    const { attemptId } = (await client.start('fix-the-field')).body;
    await client.abandon(attemptId);

    const res = await client.complete(attemptId);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ATTEMPT_NOT_ACTIVE');
  });

  test.each([
    { slug: 'match-the-word', total: 5, table: [[5, 3], [4, 2], [3, 2], [2, 1], [1, 1], [0, 0]] },
    {
      slug: 'fix-the-field',
      total: 6,
      table: [[6, 3], [5, 2], [4, 2], [3, 1], [2, 1], [1, 0], [0, 0]],
    },
  ])('stars and badge for $slug (total $total)', async ({ slug, total, table }) => {
    const client = newClient();
    for (const [score, stars] of table) {
      const res = await completeRound(client, slug, scorePlan(total, score));
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ score, total, stars, points: score * 10 });
      expect(res.body.badge.earned).toBe(score >= 4);
    }
  });

  test('the response has exactly the documented fields for each kind of game', async () => {
    const client = newClient();

    const g3 = await completeRound(client, 'crop-superpowers');
    expect(sorted(Object.keys(g3.body))).toEqual(sorted(BASE_KEYS));
    expect(g3.body.badge).toEqual({ name: 'Crop Hero', iconKey: 'badge-crop-hero', earned: true });
    expect(g3.body.nextGame).toEqual({ slug: 'fix-the-field', title: 'Fix the Field' });

    const g2 = await completeRound(client, 'satellite-or-ground');
    expect(sorted(Object.keys(g2.body))).toEqual(sorted([...BASE_KEYS, 'recap']));
    expect(g2.body.collection).toEqual([]);
    expect(g2.body.recap).toEqual([
      { label: 'Satellite: big areas', iconKey: 'choice-satellite' },
      { label: 'On the Ground: close details', iconKey: 'choice-on-the-ground' },
      { label: 'Both Together: most accurate', iconKey: 'choice-both-together' },
    ]);
    expect(g2.body.nextGame).toEqual({ slug: 'crop-superpowers', title: 'Crop Superpowers' });

    const g5 = await completeRound(client, 'weather-and-crops');
    expect(sorted(Object.keys(g5.body))).toEqual(sorted([...BASE_KEYS, 'finale']));
    expect(g5.body.nextGame).toBeNull();
  });

  test('collection sizes: 5 for Game 1, 6 for Games 3 to 5, empty for Game 2', async () => {
    const client = newClient();
    const sizes = {};
    for (const slug of GAME_SLUGS) {
      const res = await completeRound(client, slug);
      sizes[slug] = res.body.collection.length;
      if (slug === 'crop-superpowers') {
        expect(new Set(res.body.collection.map((c) => c.key)).size).toBe(6);
      }
    }
    expect(sizes).toEqual({
      'match-the-word': 5,
      'satellite-or-ground': 0,
      'crop-superpowers': 6,
      'fix-the-field': 6,
      'weather-and-crops': 6,
    });
  });

  test('only first-try questions earn their item, in question order, and bestStreak is saved', async () => {
    const client = newClient();
    const plan = ['correct', 'skip', 'wrong-then-correct', 'correct', 'correct', 'correct'];
    const attempt = await playRound(client, 'fix-the-field', plan);

    const res = await client.complete(attempt.attemptId);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      score: 4,
      total: 6,
      stars: 2,
      points: 40,
      bestStreak: 3,
    });
    expect(res.body.badge.earned).toBe(true);
    expect(res.body.collection.map((c) => c.earned)).toEqual([true, false, false, true, true, true]);

    const expectedKeys = [];
    for (const q of [...attempt.questions].sort((a, b) => a.position - b.position)) {
      const stored = await Question.findById(q.id).lean();
      expectedKeys.push(stored.collectionItem.key);
    }
    expect(res.body.collection.map((c) => c.key)).toEqual(expectedKeys);
  });

  test('completing saves the result and removes the expiry', async () => {
    const client = newClient();
    const attempt = await playRound(client, 'fix-the-field', scorePlan(6, 4));

    const res = await client.complete(attempt.attemptId);

    const saved = await Attempt.findById(attempt.attemptId).lean();
    expect(res.headers['cache-control']).toBe('no-store');
    expect(saved.status).toBe('completed');
    expect(saved.expiresAt).toBeUndefined();
    expect(saved.finishedAt).toBeInstanceOf(Date);
    expect(saved.result).toMatchObject({ score: 4, total: 6, stars: 2, badgeEarned: true });
    expect(saved.result.completedAt).toBeInstanceOf(Date);
  });

  test('calling complete twice returns the same result and adds no points', async () => {
    const client = newClient();
    const attempt = await playRound(client, 'fix-the-field', scorePlan(6, 4));

    const first = await client.complete(attempt.attemptId);
    const second = await client.complete(attempt.attemptId);

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    const progress = await Progress.find({ playerId: client.playerId }).lean();
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({ timesPlayed: 1, bestPoints: 40, bestScore: 4 });
  });

  test('two parallel complete calls give the same result and count once', async () => {
    const client = newClient();
    const attempt = await playRound(client, 'fix-the-field', scorePlan(6, 5));

    const [a, b] = await Promise.all([
      client.complete(attempt.attemptId),
      client.complete(attempt.attemptId),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body).toEqual(b.body);
    const progress = await Progress.find({ playerId: client.playerId }).lean();
    expect(progress).toHaveLength(1);
    expect(progress[0]).toMatchObject({ timesPlayed: 1, bestPoints: 50 });
  });

  test('progress keeps the best attempt by points and the badge stays earned', async () => {
    const client = newClient();
    const progressOf = async () =>
      (await client.progress()).body.games.find((g) => g.slug === 'fix-the-field');

    await completeRound(client, 'fix-the-field', scorePlan(6, 3));
    expect(await progressOf()).toMatchObject({
      completed: true,
      bestScore: 3,
      bestStars: 1,
      bestPoints: 30,
      badgeEarned: false,
    });

    await completeRound(client, 'fix-the-field', scorePlan(6, 5));
    expect(await progressOf()).toMatchObject({
      bestScore: 5,
      bestStars: 2,
      bestPoints: 50,
      badgeEarned: true,
    });

    await completeRound(client, 'fix-the-field', scorePlan(6, 1));
    expect(await progressOf()).toMatchObject({
      bestScore: 5,
      bestStars: 2,
      bestPoints: 50,
      badgeEarned: true,
    });

    const row = await Progress.findOne({ playerId: client.playerId }).lean();
    expect(row.timesPlayed).toBe(3);
    const listed = (await client.games()).body.games.find((g) => g.slug === 'fix-the-field');
    expect(listed.best).toMatchObject({ score: 5, points: 50, badgeEarned: true, timesPlayed: 3 });
  });

  test('the finale of a player who has only finished Weather and Crops', async () => {
    const client = newClient();
    const res = await completeRound(client, 'weather-and-crops');

    expect(res.body.nextGame).toBeNull();
    expect(res.body.finale).toMatchObject({
      allGamesDone: false,
      totalPoints: 60,
      gamesDone: 1,
      masterBadge: { name: 'Soil Expert', iconKey: 'badge-soil-expert', earned: false },
    });
    expect(res.body.finale.badges).toEqual([
      { gameSlug: 'match-the-word', name: 'Word Wizard', iconKey: 'badge-word-wizard', earned: false },
      { gameSlug: 'satellite-or-ground', name: 'Data Detective', iconKey: 'badge-data-detective', earned: false },
      { gameSlug: 'crop-superpowers', name: 'Crop Hero', iconKey: 'badge-crop-hero', earned: false },
      { gameSlug: 'fix-the-field', name: 'Field Doctor', iconKey: 'badge-field-doctor', earned: false },
      { gameSlug: 'weather-and-crops', name: 'Weather Watcher', iconKey: 'badge-weather-watcher', earned: true },
    ]);
  });

  test('the Soil Expert badge is earned when all 5 game badges are earned', async () => {
    const client = newClient();
    await completeRound(client, 'match-the-word');
    await completeRound(client, 'satellite-or-ground', scorePlan(6, 4));
    await completeRound(client, 'crop-superpowers');
    await completeRound(client, 'fix-the-field');
    const res = await completeRound(client, 'weather-and-crops');

    expect(res.body.finale).toMatchObject({ allGamesDone: true, totalPoints: 270, gamesDone: 5 });
    expect(res.body.finale.badges.every((b) => b.earned)).toBe(true);
    expect(res.body.finale.masterBadge.earned).toBe(true);
    expect((await client.progress()).body.masterBadge.earned).toBe(true);
  });

  test('all 5 games finished but one badge missing means no Soil Expert badge', async () => {
    const client = newClient();
    await completeRound(client, 'match-the-word', scorePlan(5, 3));
    await completeRound(client, 'satellite-or-ground');
    await completeRound(client, 'crop-superpowers');
    await completeRound(client, 'fix-the-field');
    const res = await completeRound(client, 'weather-and-crops');

    expect(res.body.finale).toMatchObject({ allGamesDone: true, gamesDone: 5, totalPoints: 270 });
    expect(res.body.finale.badges[0]).toMatchObject({ gameSlug: 'match-the-word', earned: false });
    expect(res.body.finale.masterBadge.earned).toBe(false);
  });

  test('another player gets 403, an unknown attempt 404, a malformed id 400', async () => {
    const client = newClient();
    const attempt = await playRound(client, 'fix-the-field');

    const intruder = await newClient().complete(attempt.attemptId);
    expect(intruder.status).toBe(403);
    expect(intruder.body.error.code).toBe('FORBIDDEN');
    expect((await Attempt.findById(attempt.attemptId).lean()).status).toBe('active');
    expect(await Progress.countDocuments()).toBe(0);

    const unknown = await client.complete(new mongoose.Types.ObjectId().toString());
    expect(unknown.status).toBe(404);
    expect(unknown.body.error.code).toBe('NOT_FOUND');

    const malformed = await client.complete('abc');
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.code).toBe('VALIDATION_ERROR');
  });
});