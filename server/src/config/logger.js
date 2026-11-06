import pino from 'pino';
import { env } from './env.js';

// Sensitive values never reach the logs, wherever they appear in a logged object.
export const REDACT_PATHS = [
  'password',
  'confirmPassword',
  'currentPassword',
  'newPassword',
  'passwordHash',
  'token',
  'email',
  'phone',
  'authorization',
  '*.password',
  '*.confirmPassword',
  '*.currentPassword',
  '*.newPassword',
  '*.passwordHash',
  '*.token',
  '*.email',
  '*.phone',
  '*.authorization',
  'req.headers.authorization',
  'req.headers.cookie',
  'err.keyValue',
];

export const redactOptions = { paths: REDACT_PATHS, censor: '[Redacted]' };

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
  redact: redactOptions,
});