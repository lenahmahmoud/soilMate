import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { v4 as uuidv4 } from 'uuid';
import Game from '../../src/models/Game.js';
import Question from '../../src/models/Question.js';
import Player from '../../src/models/Player.js';
import Attempt from '../../src/models/Attempt.js';
import Progress from '../../src/models/Progress.js';
import QuestionHistory from '../../src/models/QuestionHistory.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all(
    [Game, Question, Player, Attempt, Progress, QuestionHistory].map((m) => m.init()),
  );
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})),
  );
});

const choice = (key) => ({ key, label: `Label ${key}`, iconKey: `choice-${key}` });

const validGame = (over = {}) => ({
  slug: 'match-the-word',
  title: 'Match the Word',
  position: 1,
  questionsPerRound: 5,
  poolSize: 6,
  choiceMode: 'pool',
  mascotOutfit: 'none',
  speechBubble: 'What does this word mean?',
  correctBannerTitle: 'Great job!',
  collectionKind: 'terms',
  badge: { name: 'Word Wizard', iconKey: 'badge-word-wizard' },
  nextGameSlug: 'satellite-or-ground',
  isFinale: false,
  ...over,
});

const validQuestion = (over = {}) => ({
  key: 'g2-001',
  gameSlug: 'satellite-or-ground',
  prompt: 'Who can tell us this?',
  choices: [choice('satellite'), choice('both'), choice('ground')],
  correctChoiceKey: 'satellite',
  explanation: 'Satellites see big areas.',
  group: 'satellite',
  ...over,
});

const validAttempt = (over = {}) => ({
  playerId: uuidv4(),
  gameSlug: 'crop-superpowers',
  total: 6,
  questions: [{ questionId: new mongoose.Types.ObjectId(), position: 1 }],
  ...over,
});

describe('Game', () => {
  test('saves a valid game; finale has nextGameSlug null', async () => {
    const g = await Game.create(
      validGame({
        slug: 'weather-and-crops',
        position: 5,
        questionsPerRound: 6,
        poolSize: 30,
        nextGameSlug: null,
        isFinale: true,
      }),
    );
    expect(g.nextGameSlug).toBeNull();
    expect(g.recapChips).toHaveLength(0);
  });

  test('rejects a duplicate slug', async () => {
    await Game.create(validGame());
    await expect(Game.create(validGame({ position: 2 }))).rejects.toThrow(/E11000/);
  });

  test('rejects a duplicate position', async () => {
    await Game.create(validGame());
    await expect(Game.create(validGame({ slug: 'fix-the-field' }))).rejects.toThrow(/E11000/);
  });

  test('rejects an unknown slug', async () => {
    await expect(Game.create(validGame({ slug: 'nope' }))).rejects.toThrow(/validation failed/i);
  });

  test('rejects questionsPerRound other than 5 or 6', async () => {
    await expect(Game.create(validGame({ questionsPerRound: 7 }))).rejects.toThrow(
      /validation failed/i,
    );
  });
});

describe('Question', () => {
  test('hides correctChoiceKey and explanation by default', async () => {
    await Question.create(validQuestion());
    const plain = await Question.findOne({ key: 'g2-001' }).lean();
    expect(plain.correctChoiceKey).toBeUndefined();
    expect(plain.explanation).toBeUndefined();
    expect(plain.prompt).toBe('Who can tell us this?');
  });

  test('returns them when selected explicitly', async () => {
    await Question.create(validQuestion());
    const full = await Question.findOne({ key: 'g2-001' })
      .select('+correctChoiceKey +explanation')
      .lean();
    expect(full.correctChoiceKey).toBe('satellite');
    expect(full.explanation).toBe('Satellites see big areas.');
  });

  test('active defaults to true and optional fields are omitted', async () => {
    const q = await Question.create(validQuestion());
    expect(q.active).toBe(true);
    expect(q.illustrationFixedKey).toBeUndefined();
    expect(q.collectionItem).toBeUndefined();
  });

  test('rejects a duplicate key', async () => {
    await Question.create(validQuestion());
    await expect(Question.create(validQuestion())).rejects.toThrow(/E11000/);
  });

  test('rejects a badly formatted key', async () => {
    await expect(Question.create(validQuestion({ key: 'q-1' }))).rejects.toThrow(
      /validation failed/i,
    );
  });

  test('accepts group A and rejects group Z', async () => {
    await expect(
      Question.create(validQuestion({ key: 'g3-001', group: 'A' })),
    ).resolves.toBeDefined();
    await expect(Question.create(validQuestion({ key: 'g3-002', group: 'Z' }))).rejects.toThrow(
      /validation failed/i,
    );
  });

  test('rejects an empty choices list', async () => {
    await expect(Question.create(validQuestion({ choices: [] }))).rejects.toThrow(
      /validation failed/i,
    );
  });
});

describe('Player', () => {
  test('saves with a UUID v4 string id', async () => {
    const id = uuidv4();
    const p = await Player.create({ _id: id });
    expect(p._id).toBe(id);
    expect(p.lastSeenAt).toBeInstanceOf(Date);
  });

  test('rejects an id that is not a UUID v4', async () => {
    await expect(Player.create({ _id: 'not-a-uuid' })).rejects.toThrow(/validation failed/i);
  });
});

describe('Attempt', () => {
  test('applies defaults', async () => {
    const a = await Attempt.create(validAttempt());
    expect(a.status).toBe('active');
    expect(a.hearts).toBe(3);
    expect(a.streak).toBe(0);
    expect(a.bestStreak).toBe(0);
    expect(a.points).toBe(0);
    expect(a.startedAt).toBeInstanceOf(Date);
    expect(a.expiresAt).toBeUndefined();
    expect(a.result).toBeUndefined();
    const q = a.questions[0];
    expect(q.wrongChoiceKeys).toHaveLength(0);
    expect(q.wrongCount).toBe(0);
    expect(q.firstTryCorrect).toBe(false);
    expect(q.skipped).toBe(false);
    expect(q.resolved).toBe(false);
  });

  test('rejects hearts below 0 or above 3', async () => {
    await expect(Attempt.create(validAttempt({ hearts: -1 }))).rejects.toThrow(
      /validation failed/i,
    );
    await expect(Attempt.create(validAttempt({ hearts: 4 }))).rejects.toThrow(
      /validation failed/i,
    );
  });

  test('rejects an invalid status and an invalid total', async () => {
    await expect(Attempt.create(validAttempt({ status: 'paused' }))).rejects.toThrow(
      /validation failed/i,
    );
    await expect(Attempt.create(validAttempt({ total: 7 }))).rejects.toThrow(/validation failed/i);
  });

  test('has the TTL index and the compound index', async () => {
    const indexes = await Attempt.collection.indexes();
    const ttl = indexes.find((i) => i.key.expiresAt === 1);
    expect(ttl).toBeDefined();
    expect(ttl.expireAfterSeconds).toBe(0);
    const compound = indexes.find(
      (i) => i.key.playerId === 1 && i.key.gameSlug === 1 && i.key.status === 1,
    );
    expect(compound).toBeDefined();
  });
});

describe('Progress', () => {
  const base = { playerId: uuidv4(), bestScore: 5, bestStars: 3, bestPoints: 50 };

  test('applies defaults', async () => {
    const p = await Progress.create({ ...base, gameSlug: 'fix-the-field' });
    expect(p.badgeEarned).toBe(false);
    expect(p.timesPlayed).toBe(0);
  });

  test('rejects a second record for the same player and game', async () => {
    await Progress.create({ ...base, gameSlug: 'fix-the-field' });
    await expect(Progress.create({ ...base, gameSlug: 'fix-the-field' })).rejects.toThrow(
      /E11000/,
    );
  });

  test('allows the same player in a different game', async () => {
    await Progress.create({ ...base, gameSlug: 'fix-the-field' });
    await expect(
      Progress.create({ ...base, gameSlug: 'weather-and-crops' }),
    ).resolves.toBeDefined();
  });
});

describe('QuestionHistory', () => {
  test('timesSeen defaults to 0', async () => {
    const h = await QuestionHistory.create({
      playerId: uuidv4(),
      gameSlug: 'crop-superpowers',
      questionId: new mongoose.Types.ObjectId(),
    });
    expect(h.timesSeen).toBe(0);
  });

  test('rejects a duplicate player and question', async () => {
    const doc = {
      playerId: uuidv4(),
      gameSlug: 'crop-superpowers',
      questionId: new mongoose.Types.ObjectId(),
    };
    await QuestionHistory.create(doc);
    await expect(QuestionHistory.create(doc)).rejects.toThrow(/E11000/);
  });
});