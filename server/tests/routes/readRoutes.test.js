import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { v4 as uuidv4 } from 'uuid';
import { setTestEnv } from '../helpers/testEnv.js';
import { buildPool } from '../helpers/poolFixture.js';
import { seedDatabase } from '../../src/services/seedService.js';
import { GAME_SLUGS } from '../../src/constants/enums.js';
import Player from '../../src/models/Player.js';
import Progress from '../../src/models/Progress.js';
import QuestionHistory from '../../src/models/QuestionHistory.js';

let mongod;
let app;

beforeAll(async () => {
  setTestEnv();
  const { createApp } = await import('../../src/app.js');
  app = createApp();

  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await seedDatabase(buildPool());
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Promise.all([
    Player.deleteMany({}),
    Progress.deleteMany({}),
    QuestionHistory.deleteMany({}),
  ]);
});

const get = (path, playerId) => {
  const req = request(app).get(path);
  return playerId ? req.set('X-Player-Id', playerId) : req;
};

const progressDoc = (playerId, gameSlug, over = {}) => ({
  playerId,
  gameSlug,
  bestScore: 4,
  bestStars: 2,
  bestPoints: 40,
  badgeEarned: true,
  timesPlayed: 1,
  completedAt: new Date(),
  ...over,
});

const historyRows = (playerId, gameSlug, n) =>
  Array.from({ length: n }, () => ({
    playerId,
    gameSlug,
    questionId: new mongoose.Types.ObjectId(),
    timesSeen: 1,
    lastSeenAt: new Date(),
  }));

describe('GET /api/health', () => {
  test('returns ok and does not create a player', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    expect(res.headers['x-player-id']).toBeUndefined();
    expect(await Player.countDocuments()).toBe(0);
  });
});

describe('GET /api/games', () => {
  test('lists the 5 games in position order with only the documented fields', async () => {
    const res = await get('/api/games');
    expect(res.status).toBe(200);
    expect(res.headers['x-player-id']).toHaveLength(36);
    expect(res.body.games.map((g) => g.slug)).toEqual(GAME_SLUGS);

    for (const game of res.body.games) {
      expect(Object.keys(game).sort()).toEqual(
        [
          'slug',
          'title',
          'position',
          'questionsPerRound',
          'poolSize',
          'questionsSeen',
          'mascotOutfit',
          'badge',
          'best',
        ].sort(),
      );
    }

    expect(res.body.games[0]).toEqual({
      slug: 'match-the-word',
      title: 'Match the Word',
      position: 1,
      questionsPerRound: 5,
      poolSize: 6,
      questionsSeen: 0,
      mascotOutfit: 'none',
      badge: { name: 'Word Wizard', iconKey: 'badge-word-wizard' },
      best: {
        score: null,
        stars: null,
        points: null,
        badgeEarned: false,
        completed: false,
        timesPlayed: 0,
      },
    });
  });

  test('questionsSeen counts only this player and this game', async () => {
    const a = uuidv4();
    const b = uuidv4();
    await QuestionHistory.insertMany([
      ...historyRows(a, 'crop-superpowers', 3),
      ...historyRows(b, 'crop-superpowers', 1),
    ]);

    const forA = (await get('/api/games', a)).body.games;
    const forB = (await get('/api/games', b)).body.games;

    expect(forA.find((g) => g.slug === 'crop-superpowers').questionsSeen).toBe(3);
    expect(forA.find((g) => g.slug === 'fix-the-field').questionsSeen).toBe(0);
    expect(forB.find((g) => g.slug === 'crop-superpowers').questionsSeen).toBe(1);
  });

  test('questionsSeen never goes above poolSize', async () => {
    const id = uuidv4();
    await QuestionHistory.insertMany(historyRows(id, 'match-the-word', 8));
    const games = (await get('/api/games', id)).body.games;
    expect(games[0].questionsSeen).toBe(6);
  });

  test('best reflects the saved Progress for that game only', async () => {
    const id = uuidv4();
    await Progress.create(
      progressDoc(id, 'match-the-word', {
        bestScore: 5,
        bestStars: 3,
        bestPoints: 50,
        timesPlayed: 2,
      }),
    );

    const games = (await get('/api/games', id)).body.games;
    expect(games[0].best).toEqual({
      score: 5,
      stars: 3,
      points: 50,
      badgeEarned: true,
      completed: true,
      timesPlayed: 2,
    });
    expect(games[1].best.completed).toBe(false);
    expect(games[1].best.score).toBeNull();
  });
});

describe('GET /api/players/me/progress', () => {
  test('a new player has no progress and the master badge is locked', async () => {
    const res = await get('/api/players/me/progress');
    expect(res.status).toBe(200);
    expect(res.body.totalPoints).toBe(0);
    expect(res.body.gamesDone).toBe(0);
    expect(res.body.games.map((g) => g.slug)).toEqual(GAME_SLUGS);
    expect(res.body.games[0]).toEqual({
      slug: 'match-the-word',
      completed: false,
      bestScore: null,
      bestStars: null,
      bestPoints: null,
      badgeEarned: false,
      questionsSeen: 0,
    });
    expect(res.body.masterBadge).toEqual({
      name: 'Soil Expert',
      iconKey: 'badge-soil-expert',
      earned: false,
    });
  });

  test('sums the best points and counts the finished games', async () => {
    const id = uuidv4();
    await Progress.create([
      progressDoc(id, 'match-the-word', { bestScore: 5, bestStars: 3, bestPoints: 50 }),
      progressDoc(id, 'fix-the-field', { bestScore: 3, bestStars: 1, bestPoints: 30, badgeEarned: false }),
    ]);
    await QuestionHistory.insertMany(historyRows(id, 'fix-the-field', 4));

    const res = await get('/api/players/me/progress', id);
    expect(res.body.totalPoints).toBe(80);
    expect(res.body.gamesDone).toBe(2);

    const byslug = Object.fromEntries(res.body.games.map((g) => [g.slug, g]));
    expect(byslug['match-the-word']).toEqual({
      slug: 'match-the-word',
      completed: true,
      bestScore: 5,
      bestStars: 3,
      bestPoints: 50,
      badgeEarned: true,
      questionsSeen: 0,
    });
    expect(byslug['fix-the-field'].badgeEarned).toBe(false);
    expect(byslug['fix-the-field'].questionsSeen).toBe(4);
    expect(byslug['crop-superpowers'].completed).toBe(false);
  });

  test('the master badge needs all 5 game badges', async () => {
    const id = uuidv4();
    await Progress.create(
      GAME_SLUGS.map((slug, i) =>
        progressDoc(id, slug, { badgeEarned: i !== 4, bestPoints: 40 }),
      ),
    );

    const before = (await get('/api/players/me/progress', id)).body;
    expect(before.gamesDone).toBe(5);
    expect(before.totalPoints).toBe(200);
    expect(before.masterBadge.earned).toBe(false);

    await Progress.updateOne(
      { playerId: id, gameSlug: 'weather-and-crops' },
      { $set: { badgeEarned: true } },
    );
    const after = (await get('/api/players/me/progress', id)).body;
    expect(after.masterBadge.earned).toBe(true);
  });
});