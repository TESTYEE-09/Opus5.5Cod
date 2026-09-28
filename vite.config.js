import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// relative base so the build works from any GitHub Pages path.
// Three pages: Frontline (/), Horizon (/horizon/) and Orbit (/orbit/), sharing public/ assets.
export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        horizon: resolve(import.meta.dirname, 'horizon/index.html'),
        orbit: resolve(import.meta.dirname, 'orbit/index.html'),
      },
    },
  },
});
