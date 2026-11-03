import {
  slugParam,
  attemptIdParam,
  answerBody,
  skipBody,
  emptyBody,
} from '../../src/schemas/attemptSchemas.js';

const ok = (schema, value) => schema.safeParse(value).success;
const ID = 'a1b2c3d4e5f6a1b2c3d4e5f6';

describe('slugParam', () => {
  test('accepts well-formed slugs', () => {
    for (const slug of ['match-the-word', 'satellite-or-ground', 'unknown-but-well-formed']) {
      expect(ok(slugParam, { slug })).toBe(true);
    }
  });

  test('rejects malformed slugs and extra fields', () => {
    const bad = [
      { slug: '' },
      { slug: 'Bad Slug' },
      { slug: 'UPPER' },
      { slug: 'x'.repeat(41) },
      { slug: 5 },
      {},
      { slug: 'ok', extra: 1 },
    ];
    for (const value of bad) expect(ok(slugParam, value)).toBe(false);
  });
});

describe('attemptIdParam', () => {
  test('accepts a 24-character lowercase hex id', () => {
    expect(ok(attemptIdParam, { attemptId: ID })).toBe(true);
  });

  test('rejects short, long, non-hex, uppercase and extra fields', () => {
    const bad = [
      { attemptId: 'abc' },
      { attemptId: `${ID}0` },
      { attemptId: 'z'.repeat(24) },
      { attemptId: ID.toUpperCase() },
      { attemptId: ID, extra: 1 },
    ];
    for (const value of bad) expect(ok(attemptIdParam, value)).toBe(false);
  });
});

describe('answerBody', () => {
  test('accepts valid choice keys', () => {
    for (const choiceKey of ['a', 'satellite', 'g1-003', 'x'.repeat(40)]) {
      expect(ok(answerBody, { questionId: ID, choiceKey })).toBe(true);
    }
  });

  test('rejects bad choice keys', () => {
    for (const choiceKey of ['', 'A', 'has space', 'x'.repeat(41), 'under_score']) {
      expect(ok(answerBody, { questionId: ID, choiceKey })).toBe(false);
    }
  });

  test('rejects missing, unknown and non-string fields', () => {
    expect(ok(answerBody, { choiceKey: 'a' })).toBe(false);
    expect(ok(answerBody, { questionId: ID })).toBe(false);
    expect(ok(answerBody, { questionId: 'nope', choiceKey: 'a' })).toBe(false);
    expect(ok(answerBody, { questionId: 5, choiceKey: 'a' })).toBe(false);
    expect(ok(answerBody, { questionId: ID, choiceKey: 5 })).toBe(false);
    expect(ok(answerBody, { questionId: ID, choiceKey: 'a', extra: true })).toBe(false);
  });
});

describe('skipBody', () => {
  test('accepts a question id and rejects anything else', () => {
    expect(ok(skipBody, { questionId: ID })).toBe(true);
    expect(ok(skipBody, {})).toBe(false);
    expect(ok(skipBody, { questionId: 'nope' })).toBe(false);
    expect(ok(skipBody, { questionId: ID, choiceKey: 'a' })).toBe(false);
  });
});

describe('emptyBody', () => {
  test('accepts no body and an empty object', () => {
    expect(ok(emptyBody, undefined)).toBe(true);
    expect(ok(emptyBody, {})).toBe(true);
  });

  test('rejects unknown fields', () => {
    expect(ok(emptyBody, { anything: 1 })).toBe(false);
  });
});