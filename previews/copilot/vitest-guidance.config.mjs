import { defineConfig } from 'vitest/config';

// Pure tests only: deliberately omit the API config's MongoDB globalSetup.
export default defineConfig({
  test: {
    environment: 'node',
    env: { NODE_ENV: 'test' },
    fileParallelism: false,
    maxWorkers: 1,
  },
});
