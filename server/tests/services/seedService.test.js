import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Game from '../../src/models/Game.js';
import Question from '../../src/models/Question.js';
import { seedDatabase } from '../../src/services/seedService.js';
import { buildPool } from '../helpers/poolFixture.js';

let mongod;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  await Promise.all([Game.init(), Question.init()]);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  await Game.deleteMany({});
  await Question.deleteMany({});
});

const fixTheField = (pool) => pool.questions.filter((q) => q.gameSlug === 'fix-the-field');

describe('seedDatabase', () => {
  test('inserts all games and questions and reports counts', async () => {
    const summary = await seedDatabase(buildPool());
    expect(summary.games).toEqual({ inserted: 5, updated: 0, unchanged: 0 });
    expect(summary.questions['match-the-word']).toEqual({ inserted: 6, updated: 0, unchanged: 0 });
    expect(summary.questions['weather-and-crops']).toEqual({
      inserted: 30,
      updated: 0,
      unchanged: 0,
    });
    expect(await Game.countDocuments()).toBe(5);
    expect(await Question.countDocuments()).toBe(126);
  });

  test('running it twice changes nothing', async () => {
    await seedDatabase(buildPool());
    const before = await Question.find().sort({ key: 1 }).lean();

    const second = await seedDatabase(buildPool());
    expect(second.games).toEqual({ inserted: 0, updated: 0, unchanged: 5 });
    expect(second.questions['fix-the-field']).toEqual({ inserted: 0, updated: 0, unchanged: 30 });

    const after = await Question.find().sort({ key: 1 }).lean();
    expect(after).toEqual(before);
  });

  test('updates a changed question and removes a field dropped from the data', async () => {
    const first = buildPool();
    fixTheField(first)[0].subtitle = 'Old subtitle';
    await seedDatabase(first);

    const second = buildPool();
    const target = fixTheField(second)[0];
    target.prompt = 'New prompt';
    target.correctChoiceKey = 'b';
    target.explanation = 'New explanation.';
    const summary = await seedDatabase(second);

    expect(summary.questions['fix-the-field']).toEqual({ inserted: 0, updated: 1, unchanged: 29 });
    const stored = await Question.findOne({ key: target.key })
      .select('+correctChoiceKey +explanation')
      .lean();
    expect(stored.prompt).toBe('New prompt');
    expect(stored.subtitle).toBeUndefined();
    expect(stored.correctChoiceKey).toBe('b');
    expect(stored.explanation).toBe('New explanation.');
    expect(await Question.countDocuments()).toBe(126);
  });

  test('a question is retired with active: false', async () => {
    await seedDatabase(buildPool());
    const pool = buildPool();
    const target = pool.questions.find((q) => q.gameSlug === 'crop-superpowers');
    target.active = false;

    const summary = await seedDatabase(pool);
    expect(summary.questions['crop-superpowers'].updated).toBe(1);
    expect((await Question.findOne({ key: target.key }).lean()).active).toBe(false);
  });

  test('never deletes questions that are missing from the input', async () => {
    await seedDatabase(buildPool());
    const pool = buildPool();
    await seedDatabase({
      games: pool.games,
      questions: pool.questions.filter((q) => q.gameSlug === 'match-the-word'),
    });
    expect(await Question.countDocuments()).toBe(126);
  });

  test('an invalid document throws and nothing is written', async () => {
    const pool = buildPool();
    pool.questions[0].key = 'bad';
    await expect(seedDatabase(pool)).rejects.toThrow(/bad/);
    expect(await Question.countDocuments()).toBe(0);
    expect(await Game.countDocuments()).toBe(0);
  });
});