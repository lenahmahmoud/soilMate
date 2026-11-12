import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js'; // CHECK: adjust if your logger is a default export
import { AppError } from '../../utils/AppError.js';
import { scoreResultSchema, plansResultSchema } from './scoringSchemas.js';
import { mockScoringClient } from './mockScoringClient.js';
import { createPythonScoringClient } from './pythonScoringClient.js';

let pythonClient;
function pickClient() {
  if (env.SCORING_MODE !== 'python') return mockScoringClient;
  pythonClient ??= createPythonScoringClient({
    baseUrl: env.PYTHON_URL,
    timeoutMs: env.PYTHON_TIMEOUT_MS,
  });
  return pythonClient;
}

function validated(schema, raw, requestId, what) {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    logger.warn({ requestId }, `${what} result failed validation`); // never the body
    throw new AppError(502, 'SCORING_INVALID_RESPONSE', 'The scoring service returned an unexpected answer');
  }
  return parsed.data;
}

// Both clients are validated here, so the rest of the app only ever sees a valid result.
export async function score(args) {
  return validated(scoreResultSchema, await pickClient().score(args), args.requestId, 'scoring');
}

export async function plans(args) {
  return validated(plansResultSchema, await pickClient().plans(args), args.requestId, 'plans');
}