import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    /*
      dotenv does not overwrite variables that are already set, and `env.ts`
      calls it at import time. Setting these here is what keeps `npm test` away
      from the deployment's real database and signing keys even though its .env
      sits right next to the tests.
    */
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/tanzalert-test',
      JWT_SECRET: 'test-only-signing-secret-at-least-32-characters',
      JWT_REFRESH_SECRET: 'test-only-refresh-secret-at-least-32-characters',
      ADMIN_EMAIL: 'admin@tanzalert.test',
      ADMIN_PASSWORD: 'test-only-admin-password',
      DISPATCH_ACK_SECONDS: '90',
      DISPATCH_OVERDUE_SECONDS: '120',
    },
    testTimeout: 30_000,
    // The first run downloads a mongod binary.
    hookTimeout: 180_000,
  },
});
