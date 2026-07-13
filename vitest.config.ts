import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['**/*.slow.test.ts', 'tests/e2e/**'],
    fileParallelism: true,
    testTimeout: 60_000,
  },
})
