import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // O hot reload do Solid não é resolvível pelo runner do Vitest; só faz sentido no vite dev.
  plugins: [solid({ hot: !process.env.VITEST })],
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
