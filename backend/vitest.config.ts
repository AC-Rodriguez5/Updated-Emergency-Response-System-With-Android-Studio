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
      // Pinned so the gating tests do not depend on whichever provider the
      // developer's own .env happens to name.
      CAPTCHA_PROVIDER: 'builtin',
      /*
        Likewise pinned. A developer whose .env arms the dry run — which is the
        right thing to do on a deployment with a backlog — would otherwise turn
        every retention test into a no-op that still passes its own assertions
        about counts while deleting nothing.
      */
      RETENTION_DRY_RUN: 'false',
      LOCATION_RETENTION_DAYS: '365',
      TRANSPORT_RETENTION_DAYS: '365',
    },
    testTimeout: 30_000,
    // The first run downloads a mongod binary.
    hookTimeout: 180_000,
  },
});
