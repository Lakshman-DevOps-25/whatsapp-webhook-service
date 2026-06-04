'use strict';

const createApp = require('./app');
const config = require('./config');
const logger = require('./utils/logger');
const { connectMongo, mongoose } = require('./db/mongo');
const storageService = require('./services/StorageService');
const configService = require('./services/ConfigService');
const tokenManager = require('./services/TokenManager');

async function start() {
  await connectMongo();

  // Best-effort bucket + config bootstrap (non-fatal so the service still boots).
  await storageService.ensureBucket().catch((e) => logger.error({ error: e.message }, 'MinIO bucket init failed'));
  if (config.whatsapp.phoneNumberId && config.whatsapp.accessToken) {
    await configService.getActive().catch((e) => logger.error({ error: e.message }, 'Config bootstrap failed'));
  } else {
    logger.warn('WhatsApp env not fully set; configure via PUT /config before sending messages');
  }

  // Periodic token freshness check (50-day threshold) if enabled.
  if (config.token.checkIntervalHours > 0) {
    const everyMs = config.token.checkIntervalHours * 60 * 60 * 1000;
    setInterval(() => {
      tokenManager.ensureFresh().catch((e) => logger.error({ error: e.message }, 'Scheduled token check failed'));
    }, everyMs).unref();
    logger.info({ everyHours: config.token.checkIntervalHours }, 'Scheduled token freshness check enabled');
  }

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(`whatsapp-webhook-service listening on http://localhost:${config.port}`);
  });

  const shutdown = (signal) => {
    logger.info({ signal }, 'Shutting down');
    server.close(async () => {
      await mongoose.connection.close().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  logger.error({ error: err.message, stack: err.stack }, 'Failed to start');
  process.exit(1);
});
