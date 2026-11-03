import { rankQuestions, pickFromPool } from '../../src/services/picker.service.js';

const CH = (keys) => keys.map((k) => ({ key: k, label: `Label ${k}`, iconKey: 'choice-x' }));
const q = (slug, n, extra = {}) => ({
  _id: `${slug}:${n}`,
  key: `k-${n}`,
  gameSlug: slug,
  prompt: `Prompt ${n}`,
  choices: CH(['a', 'b', 'c']),
  ...extra,
});
const seen = (question, timesSeen, lastSeenAt) => ({
  questionId: question._id,
  timesSeen,
  lastSeenAt: new Date(lastSeenAt),
});

const game1Pool = () =>
  Array.from({ length: 6 }, (_, i) => {
    const n = i + 1;
    const key = `g1-00${n}`;
    return {
      _id: `g1:${n}`,
      key,
      gameSlug: 'match-the-word',
      prompt: `Term ${n}`,
      choices: [{ key, label: `Meaning ${n}`, iconKey: `term-${n}` }],
    };
  });

const game2Pool = () =>
  Array.from({ length: 30 }, (_, i) =>
    q('satellite-or-ground', i + 1, {
      group: ['satellite', 'both', 'ground'][i % 3],
      // stored in a different order on purpose: the picker must fix it
      choices: [
        { key: 'both', label: 'Both Together', iconKey: 'choice-both-together' },
        { key: 'ground', label: 'On the Ground', iconKey: 'choice-on-the-ground' },
        { key: 'satellite', label: 'Satellite', iconKey: 'choice-satellite' },
      ],
    })
  );

const game3Pool = () => {
  const counts = [4, 4, 4, 4, 4, 4, 3, 3];
  const pool = [];
  let n = 0;
  [...'ABCDEFGH'].forEach((group, i) => {
    for (let j = 0; j < counts[i]; j += 1) {
      n += 1;
      pool.push(q('crop-superpowers', n, { group }));
    }
  });
  return pool;
};

const game4Pool = () => Array.from({ length: 30 }, (_, i) => q('fix-the-field', i + 1));

describe('rankQuestions', () => {
  test('unseen first, then lowest timesSeen, then oldest lastSeenAt', () => {
    const [a, b, c, d] = [1, 2, 3, 4].map((n) => q('fix-the-field', n));
    const history = [seen(a, 2, 1000), seen(b, 1, 5000), seen(c, 1, 2000)];
    const ranked = rankQuestions([a, b, c, d], history);
    expect(ranked.map((x) => x._id)).toEqual([d._id, c._id, b._id, a._id]);
  });

  test('ties are broken randomly', () => {
    const [a, b] = [1, 2].map((n) => q('fix-the-field', n));
    const firsts = new Set();
    for (let i = 0; i < 200; i += 1) firsts.add(rankQuestions([a, b], [])[0]._id);
    expect(firsts.size).toBe(2);
  });
});

describe('pickFromPool', () => {
  test('Game 1: 5 questions, 3 unique choices each, correct meaning included', () => {
    const pool = game1Pool();
    const poolKeys = pool.map((p) => p.key);
    const result = pickFromPool({ gameSlug: 'match-the-word', questions: pool, history: [], count: 5 });
    expect(result).toHaveLength(5);
    for (const r of result) {
      const keys = r.choices.map((c) => c.key);
      expect(keys).toHaveLength(3);
      expect(new Set(keys).size).toBe(3);
      expect(keys).toContain(r.question.key);
      keys.forEach((k) => expect(poolKeys).toContain(k));
    }
  });

  test('Game 1: the question left out last round is picked next', () => {
    const pool = game1Pool();
    const history = pool.slice(0, 5).map((p) => seen(p, 1, 1000));
    const result = pickFromPool({ gameSlug: 'match-the-word', questions: pool, history, count: 5 });
    expect(result.map((r) => r.question._id)).toContain(pool[5]._id);
  });

  test('Game 2: 2 per group, fixed choice order, positions 1..6', () => {
    const result = pickFromPool({ gameSlug: 'satellite-or-ground', questions: game2Pool(), history: [], count: 6 });
    expect(result).toHaveLength(6);
    const groups = result.map((r) => r.question.group);
    for (const g of ['satellite', 'both', 'ground']) {
      expect(groups.filter((x) => x === g)).toHaveLength(2);
    }
    result.forEach((r) => expect(r.choices.map((c) => c.key)).toEqual(['satellite', 'both', 'ground']));
    expect(result.map((r) => r.position).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  test('Game 3: 6 different powers, best-ranked crop of each chosen power', () => {
    const pool = game3Pool();
    const history = [];
    for (const letter of 'ABCDEFGH') {
      const members = pool.filter((p) => p.group === letter);
      members.slice(0, -1).forEach((m) => history.push(seen(m, 1, 1000)));
    }
    const result = pickFromPool({ gameSlug: 'crop-superpowers', questions: pool, history, count: 6 });
    expect(result).toHaveLength(6);
    expect(new Set(result.map((r) => r.question.group)).size).toBe(6);
    for (const r of result) {
      const members = pool.filter((p) => p.group === r.question.group);
      expect(r.question._id).toBe(members.at(-1)._id);
    }
  });

  test('Games 3 to 5: choices are the 3 stored choices (shuffled)', () => {
    const result = pickFromPool({ gameSlug: 'fix-the-field', questions: game4Pool(), history: [], count: 6 });
    result.forEach((r) => expect(r.choices.map((c) => c.key).sort()).toEqual(['a', 'b', 'c']));
  });

  test('Game 4: picks the unseen questions first', () => {
    const pool = game4Pool();
    const history = pool.slice(0, 24).map((p) => seen(p, 1, 1000));
    const result = pickFromPool({ gameSlug: 'fix-the-field', questions: pool, history, count: 6 });
    expect(result.map((r) => r.question._id).sort()).toEqual(pool.slice(24).map((p) => p._id).sort());
  });

  test('every question is seen before any repeat (Game 4, 5 rounds)', () => {
    const pool = game4Pool();
    const history = [];
    const ids = [];
    for (let round = 1; round <= 5; round += 1) {
      const picked = pickFromPool({ gameSlug: 'fix-the-field', questions: pool, history, count: 6 });
      for (const p of picked) {
        ids.push(p.question._id);
        const row = history.find((h) => h.questionId === p.question._id);
        if (row) {
          row.timesSeen += 1;
          row.lastSeenAt = new Date(round * 1000);
        } else {
          history.push(seen(p.question, 1, round * 1000));
        }
      }
    }
    expect(new Set(ids).size).toBe(30);
  });

  test('throws when the pool is too small', () => {
    const pool = game4Pool().slice(0, 3);
    expect(() => pickFromPool({ gameSlug: 'fix-the-field', questions: pool, history: [], count: 6 })).toThrow();
  });
});