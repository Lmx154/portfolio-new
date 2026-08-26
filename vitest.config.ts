import { defineConfig } from 'vitest/config';

// The space math is pure TypeScript with no DOM or WebGL, so the fast node
// environment is enough. Rendering is verified by ?spacelab, not by unit tests.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
