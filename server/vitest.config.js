import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ['./tests/setup.js'],
    env: {
      NODE_ENV: 'test',
      RATE_LIMIT_DISABLED: 'true',
      UPLOAD_DIR: './.test-uploads',
      MAIL_DEV_CONSOLE_FALLBACK: 'true',
      APP_BASE_URL: 'http://localhost:5173',
      MONGODB_TEST_URI:
        process.env.MONGODB_TEST_URI || 'mongodb://127.0.0.1:27017/robust_warehouse_inventory_test'
    }
  }
});
