const valid = {
  PORT: '4000',
  NODE_ENV: 'development',
  MONGO_URI: 'mongodb://127.0.0.1:27017/soilmate',
  CLIENT_ORIGIN: 'http://localhost:5173',
  NASA_FEATURE: 'false',
  ATTEMPT_TTL_DAYS: '7',
  JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
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

  describe('SoilMate variables', () => {
    test('a missing JWT_SECRET throws and names it', () => {
      const { JWT_SECRET, ...rest } = valid;
      expect(() => parseEnv(rest)).toThrow(/JWT_SECRET/);
    });

    test('a JWT_SECRET shorter than 32 characters throws', () => {
      expect(() => parseEnv({ ...valid, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    });

    test('defaults are applied', () => {
      const env = parseEnv(valid);
      expect(env.JWT_EXPIRES_DEFAULT).toBe('1d');
      expect(env.JWT_EXPIRES_REMEMBER).toBe('30d');
      expect(env.BCRYPT_COST).toBe(12);
      expect(env.SCORING_MODE).toBe('mock');
      expect(env.PYTHON_TIMEOUT_MS).toBe(5000);
      expect(env.LAYER_DATA_DIR).toBe('src/data/layers');
    });

    test('SCORING_MODE=python without PYTHON_URL throws', () => {
      expect(() => parseEnv({ ...valid, SCORING_MODE: 'python' })).toThrow(/PYTHON_URL/);
    });

    test('SCORING_MODE=python with PYTHON_URL is accepted', () => {
      const env = parseEnv({
        ...valid,
        SCORING_MODE: 'python',
        PYTHON_URL: 'http://localhost:8000',
      });
      expect(env.SCORING_MODE).toBe('python');
    });

    test('an unknown SCORING_MODE throws', () => {
      expect(() => parseEnv({ ...valid, SCORING_MODE: 'fake' })).toThrow(/SCORING_MODE/);
    });

    test('PUBLIC_BASE_URL is required in production', () => {
      expect(() => parseEnv({ ...valid, NODE_ENV: 'production' })).toThrow(/PUBLIC_BASE_URL/);
    });

    test('PUBLIC_BASE_URL in production is accepted', () => {
      const env = parseEnv({
        ...valid,
        NODE_ENV: 'production',
        PUBLIC_BASE_URL: 'https://api.soilmate.app',
      });
      expect(env.PUBLIC_BASE_URL).toBe('https://api.soilmate.app');
    });
  });
});