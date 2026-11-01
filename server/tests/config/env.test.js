const valid = {
  PORT: '4000',
  NODE_ENV: 'development',
  MONGO_URI: 'mongodb://127.0.0.1:27017/soilmate',
  CLIENT_ORIGIN: 'http://localhost:5173',
  NASA_FEATURE: 'false',
  ATTEMPT_TTL_DAYS: '7',
};

let parseEnv;

beforeAll(async () => {
  // env.js validates process.env when imported, so set it first.
  Object.assign(process.env, valid);
  ({ parseEnv } = await import('../../src/config/env.js'));
});

describe('parseEnv', () => {
  test('parses valid values into the right types', () => {
    const env = parseEnv(valid);
    expect(env.PORT).toBe(4000);
    expect(env.ATTEMPT_TTL_DAYS).toBe(7);
    expect(env.NASA_FEATURE).toBe(false);
    expect(env.NODE_ENV).toBe('development');
  });

  test('NASA_FEATURE "true" becomes true', () => {
    expect(parseEnv({ ...valid, NASA_FEATURE: 'true' }).NASA_FEATURE).toBe(true);
  });

  test('a missing variable throws and names it', () => {
    const { MONGO_URI, ...rest } = valid;
    expect(() => parseEnv(rest)).toThrow(/MONGO_URI/);
  });

  test('an invalid PORT throws', () => {
    expect(() => parseEnv({ ...valid, PORT: 'abc' })).toThrow(/PORT/);
  });

  test('an invalid NODE_ENV throws', () => {
    expect(() => parseEnv({ ...valid, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
  });

  test('a bad CLIENT_ORIGIN throws', () => {
    expect(() => parseEnv({ ...valid, CLIENT_ORIGIN: 'not-a-url' })).toThrow(/CLIENT_ORIGIN/);
  });
});