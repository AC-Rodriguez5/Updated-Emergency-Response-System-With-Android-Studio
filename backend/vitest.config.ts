import { defineConfig } from 'vitest/config';

// Scoped to backend/ so vitest does not walk up to the root React vite.config.ts,
// which belongs to the design app and has separate (uninstalled) dependencies.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
