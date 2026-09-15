import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': new URL('./src', import.meta.url).pathname.replace(/^\/(\w:)/, '$1') } },
  server: { port: 3001, strictPort: true, proxy: { '/api': 'http://localhost:5000' } },
  build: { sourcemap: false },
});
