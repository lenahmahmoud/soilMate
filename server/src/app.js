// import express from 'express';
// import helmet from 'helmet';
// import cors from 'cors';
// import { corsOptions } from './config/cors.js';
// import { httpLogger } from './middleware/httpLogger.js';
// import { createRateLimiter } from './middleware/rateLimit.js';
// import { playerMiddleware } from './middleware/player.js';
// import { notFound } from './middleware/notFound.js';
// import { errorHandler } from './middleware/errorHandler.js';

// // Every /api route gets a player, except /api/health.
// const playerExceptHealth = (req, res, next) =>
//   req.path === '/health' ? next() : playerMiddleware(req, res, next);

// export function createApp({ apiRouter = express.Router(), rateLimit } = {}) {
//   const app = express();

//   app.use(helmet());
//   app.use(cors(corsOptions));
//   app.use(httpLogger);
//   app.use(createRateLimiter(rateLimit));
//   app.use(express.json({ limit: '10kb' }));

//   app.use('/api', playerExceptHealth, apiRouter);

//   app.use(notFound);
//   app.use(errorHandler);
//   return app;
// }

// export default createApp();



import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { corsOptions } from './config/cors.js';
import { httpLogger } from './middleware/httpLogger.js';
import { createRateLimiter } from './middleware/rateLimit.js';
import { playerMiddleware } from './middleware/player.js';
import { notFound } from './middleware/notFound.js';
import { errorHandler } from './middleware/errorHandler.js';
import defaultApiRouter from './routes/index.js';

// Every /api route gets a player, except /api/health.
const playerExceptHealth = (req, res, next) =>
  req.path === '/health' ? next() : playerMiddleware(req, res, next);

export function createApp({ apiRouter = defaultApiRouter, rateLimit } = {}) {
  const app = express();

  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(httpLogger);
  app.use(createRateLimiter(rateLimit));
  app.use(express.json({ limit: '10kb' }));

  app.use('/api', playerExceptHealth, apiRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export default createApp();