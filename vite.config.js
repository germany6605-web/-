import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2018',
    assetsInlineLimit: 0,
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: true,
  },
});
