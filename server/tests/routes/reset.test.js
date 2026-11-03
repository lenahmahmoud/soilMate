import request from 'supertest';
import { jest } from '@jest/globals';
import { v4 as uuidv4 } from 'uuid';
import { startTestApp } from '../helpers/testApp.js';
import { createClient, completeRound } from '../helpers/play.js';
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

describe('POST /api/players/me/reset', () => {
  test('deletes only this player\'s attempts, progress and history and keeps the player', async () => {
    const a = newClient();
    const b = newClient();
    await completeRound(a, 'fix-the-field');
    await a.start('crop-superpowers');
    await completeRound(b, 'fix-the-field');

    const res = await a.reset();

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reset: true });
    expect(await Attempt.countDocuments({ playerId: a.playerId })).toBe(0);
    expect(await Progress.countDocuments({ playerId: a.playerId })).toBe(0);
    expect(await QuestionHistory.countDocuments({ playerId: a.playerId })).toBe(0);
    expect(await Player.findById(a.playerId).lean()).not.toBeNull();

    expect(await Attempt.countDocuments({ playerId: b.playerId })).toBe(1);
    expect(await Progress.countDocuments({ playerId: b.playerId })).toBe(1);
    expect(await QuestionHistory.countDocuments({ playerId: b.playerId })).toBe(6);
  });

  test('after a reset the player starts from zero and can play again', async () => {
    const client = newClient();
    await completeRound(client, 'fix-the-field');
    await client.reset();

    const games = (await client.games()).body.games;
    expect(games.every((g) => g.questionsSeen === 0 && g.best.completed === false)).toBe(true);

    const progress = (await client.progress()).body;
    expect(progress).toMatchObject({ totalPoints: 0, gamesDone: 0 });
    expect(progress.masterBadge.earned).toBe(false);

    expect((await client.resume('fix-the-field')).status).toBe(404);
    expect((await client.start('fix-the-field')).status).toBe(201);
  });

  test('a player with no data can reset too', async () => {
    const res = await newClient().reset();
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ reset: true });
  });

  test('unknown body fields are rejected with 400', async () => {
    const client = newClient();
    const res = await request(ctx.app)
      .post('/api/players/me/reset')
      .set('X-Player-Id', client.playerId)
      .send({ everything: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});