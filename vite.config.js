import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  assetsInclude: ['**/*.exr'],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1200,
    rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html') } },
  },
});
