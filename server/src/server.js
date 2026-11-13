import { env } from "./config/env.js";
import { connectDB, disconnectDB } from "./config/db.js";
import { logger } from "./config/logger.js";
import { initLayerData } from "./data/loadLayerData.js";
import { initRotationLabData } from "./data/loadRotationLabData.js";
import app from "./app.js";

await connectDB();
initLayerData(env.LAYER_DATA_DIR);
logger.info("Layer data loaded");
// Fail fast: a bad or inconsistent Rotation Lab / crop file stops the server here (a missing image does not).
initRotationLabData(undefined, { onWarn: (msg) => logger.warn(msg) });
logger.info("Rotation Lab data loaded");
const server = app.listen(env.PORT, () => {
  logger.info(`Server listening on port ${env.PORT}`);
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");

  const forceExit = setTimeout(() => process.exit(1), 10000);
  forceExit.unref();

  try {
    await new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
      server.closeIdleConnections();
    });
    await disconnectDB();
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "Error during shutdown");
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));