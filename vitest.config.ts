import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    pool: 'vmThreads',
    testTimeout: 15_000,
    maxWorkers: 1,
  },
});
