import pino from 'pino';
import { Writable } from 'node:stream';

let redactOptions;

beforeAll(async () => {
  // logger.js imports env.js, which validates process.env on import.
  Object.assign(process.env, {
    PORT: '4000',
    NODE_ENV: 'test',
    MONGO_URI: 'mongodb://127.0.0.1:27017/soilmate-test',
    CLIENT_ORIGIN: 'http://localhost:5173',
    NASA_FEATURE: 'false',
    ATTEMPT_TTL_DAYS: '7',
    JWT_SECRET: 'test-secret-test-secret-test-secret-1234',
  });
  ({ redactOptions } = await import('../../src/config/logger.js'));
});

function capture() {
  const chunks = [];
  const stream = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  const log = pino({ level: 'info', redact: redactOptions }, stream);
  return { log, output: () => chunks.join('') };
}

describe('logger redaction', () => {
  test('redacts top-level secrets', () => {
    const { log, output } = capture();
    log.info({ password: 'Str0ngPass1', email: 'alex@example.com', token: 'abc.def.ghi' }, 'x');
    expect(output()).not.toMatch(/Str0ngPass1|alex@example\.com|abc\.def\.ghi/);
    expect(output()).toMatch(/\[Redacted\]/);
  });

  test('redacts one level down', () => {
    const { log, output } = capture();
    log.info({ body: { password: 'Str0ngPass1', phone: '+15553829104' } }, 'x');
    expect(output()).not.toMatch(/Str0ngPass1|15553829104/);
  });

  test('redacts the Authorization header', () => {
    const { log, output } = capture();
    log.info({ req: { headers: { authorization: 'Bearer secret-token', cookie: 'sid=1' } } }, 'x');
    expect(output()).not.toMatch(/secret-token|sid=1/);
  });

  test('redacts the email inside a Mongo duplicate-key error', () => {
    const { log, output } = capture();
    const err = new Error('duplicate');
    err.keyValue = { email: 'alex@example.com' };
    log.error({ err }, 'x');
    expect(output()).not.toMatch(/alex@example\.com/);
  });

  test('keeps harmless fields', () => {
    const { log, output } = capture();
    log.info({ status: 'ok', planKey: 'improve_soil' }, 'hello');
    expect(output()).toMatch(/improve_soil/);
    expect(output()).toMatch(/hello/);
  });
});