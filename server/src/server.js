import { createApp } from './app.js';
import { connectDB, disconnectDB } from './db/connect.js';
import { config } from './config/env.js';
import { logger } from './lib/logger.js';

async function main() {
  await connectDB();

  const app = createApp();
  const server = app.listen(config.port, () => {
    logger.info(`Robust Warehouse Inventory API listening on http://localhost:${config.port}`);
    logger.info(`Environment: ${config.env} • Timezone: ${config.tz} • Currency: ${config.currency}`);
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received. Shutting down...`);
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection:', reason);
  });
}

main().catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
