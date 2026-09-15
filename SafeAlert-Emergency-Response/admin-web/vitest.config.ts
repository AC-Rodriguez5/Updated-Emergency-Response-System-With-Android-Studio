import { defineConfig } from 'vitest/config';
import appConfig from './vite.config';
export default defineConfig({ ...appConfig, test: { include: ['src/**/*.test.ts'], environment: 'node', clearMocks: true } });
