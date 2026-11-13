import { fileURLToPath } from "node:url";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import { corsOptions } from "./config/cors.js";
import { httpLogger } from "./middleware/httpLogger.js";
import { createRateLimiter } from "./middleware/rateLimit.js";
import { playerMiddleware } from "./middleware/player.js";
import { notFound } from "./middleware/notFound.js";
import { errorHandler } from "./middleware/errorHandler.js";
import defaultApiRouter from "./routes/index.js";

// server/public (next to src). ESM has no __dirname, so it is built from import.meta.url.
const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

// Every /api route gets a player, except /api/health and the SoilMate routes.
// SoilMate uses real user accounts, so it must not create game Player records.
const SOILMATE_PREFIXES = [
  "/auth",
  "/me",
  "/meta",
  "/crops",
  "/farm",
  "/centers",
  "/map",
  "/glossary",
  "/rotation-lab", // the Rotation Lab is the only crop source now
  "/plans",
  "/dashboard",
  "/reports",
  "/journey",
];
const skipsPlayer = (reqPath) =>
  reqPath === "/health" ||
  SOILMATE_PREFIXES.some((p) => reqPath === p || reqPath.startsWith(`${p}/`));

const playerExceptHealth = (req, res, next) =>
  skipsPlayer(req.path) ? next() : playerMiddleware(req, res, next);

export function createApp({ apiRouter = defaultApiRouter, rateLimit } = {}) {
  const app = express();

  app.use(helmet());
  app.use(cors(corsOptions));

  // Crop images. Mounted before the logger and the rate limiter on purpose:
  // one page can load many images and they should not use up the API limit.
  app.use(
    "/static",
    express.static(PUBLIC_DIR, {
      maxAge: "7d",
      index: false,
      setHeaders(res) {
        // Helmet's default blocks other origins; the React app must be able to show these.
        res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      },
    }),
  );

  app.use(httpLogger);
  app.use(createRateLimiter(rateLimit));
  app.use(express.json({ limit: "10kb" }));

  app.use("/api", playerExceptHealth, apiRouter);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export default createApp();