import pinoHttp from 'pino-http';
import { logger } from '../config/logger.js';

// Only these fields are logged. Headers (X-Player-Id included) and bodies never are.
export const httpLogSerializers = {
  req: (req) => ({
    id: req.id,
    method: req.method,
    url: req.raw?.originalUrl ?? req.url,
  }),
  res: (res) => ({ statusCode: res.statusCode }),
};

export const createHttpLogger = (baseLogger = logger) =>
  pinoHttp({ logger: baseLogger, serializers: httpLogSerializers });

export const httpLogger = createHttpLogger();