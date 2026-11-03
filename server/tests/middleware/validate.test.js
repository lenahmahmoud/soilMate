import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { setTestEnv } from '../helpers/testEnv.js';
import { validate } from '../../src/middleware/validate.js';

let errorHandler;

beforeAll(async () => {
  setTestEnv();
  ({ errorHandler } = await import('../../src/middleware/errorHandler.js'));
});

function build() {
  const app = express();
  app.use(express.json());
  app.post(
    '/items/:id',
    validate({
      params: z.object({ id: z.string().length(4) }),
      query: z.object({ n: z.coerce.number() }),
      body: z.object({ choiceKey: z.string() }),
    }),
    (req, res) => res.json({ params: req.params, query: req.query, body: req.body }),
  );
  app.use(errorHandler);
  return app;
}

describe('validate', () => {
  test('replaces body, params and query with the parsed values', async () => {
    const res = await request(build())
      .post('/items/abcd?n=5')
      .send({ choiceKey: 'a', extra: 1 });
    expect(res.status).toBe(200);
    expect(res.body.query).toEqual({ n: 5 });
    expect(res.body.params).toEqual({ id: 'abcd' });
    expect(res.body.body).toEqual({ choiceKey: 'a' });
  });

  test('a bad param returns 400 with its path', async () => {
    const res = await request(build()).post('/items/abc?n=5').send({ choiceKey: 'a' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details.issues.map((i) => i.path)).toEqual(['params.id']);
  });

  test('issues from body, params and query are reported together', async () => {
    const res = await request(build()).post('/items/abc?n=oops').send({});
    const paths = res.body.error.details.issues.map((i) => i.path);
    expect(res.status).toBe(400);
    expect(paths).toEqual(expect.arrayContaining(['params.id', 'query.n', 'body.choiceKey']));
  });

  test('a missing body fails when the schema needs one', async () => {
    const res = await request(build()).post('/items/abcd?n=5');
    expect(res.status).toBe(400);
    expect(res.body.error.details.issues[0].path).toBe('body');
  });
});