import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import { z } from 'zod';
import { setTestEnv } from '../helpers/testEnv.js';
import { AppError } from '../../src/utils/AppError.js';

let errorHandler;
let notFound;

beforeAll(async () => {
  setTestEnv();
  ({ errorHandler } = await import('../../src/middleware/errorHandler.js'));
  ({ notFound } = await import('../../src/middleware/notFound.js'));
});

function appWith(handler) {
  const app = express();
  app.use(express.json({ limit: '10kb' }));
  app.post('/boom', handler);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

describe('errorHandler and notFound', () => {
  test('an AppError uses its own status, code and details', async () => {
    const app = appWith(() => {
      throw new AppError(409, 'ATTEMPT_NOT_ACTIVE', 'Attempt is not active', { attemptId: 'x' });
    });
    const res = await request(app).post('/boom');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: {
        code: 'ATTEMPT_NOT_ACTIVE',
        message: 'Attempt is not active',
        details: { attemptId: 'x' },
      },
    });
  });

  test('a ZodError becomes 400 VALIDATION_ERROR with the failing paths', async () => {
    const app = appWith(() => {
      z.object({ a: z.string() }).parse({});
    });
    const res = await request(app).post('/boom');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.issues[0].path).toBe('a');
  });

  test('a Mongoose CastError becomes 404 NOT_FOUND', async () => {
    const app = appWith(() => {
      throw new mongoose.Error.CastError('ObjectId', 'abc', '_id');
    });
    const res = await request(app).post('/boom');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  test('any other error becomes a generic 500 and leaks nothing', async () => {
    const app = appWith(() => {
      throw new Error('E11000 duplicate key collection: soilmate.questions');
    });
    const res = await request(app).post('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/E11000|soilmate|stack/);
  });

  test('broken JSON becomes 400 VALIDATION_ERROR', async () => {
    const app = appWith((req, res) => res.json({}));
    const res = await request(app)
      .post('/boom')
      .set('Content-Type', 'application/json')
      .send('{bad json');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('a body over 10kb becomes 400 VALIDATION_ERROR', async () => {
    const app = appWith((req, res) => res.json({}));
    const res = await request(app)
      .post('/boom')
      .send({ text: 'x'.repeat(11000) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('an unknown route returns 404 NOT_FOUND in the standard shape', async () => {
    const app = appWith((req, res) => res.json({}));
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
});