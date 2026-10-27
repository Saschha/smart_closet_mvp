import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['backend/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['backend/**/*.js'],
      exclude: ['backend/**/*.test.js', 'backend/index.js', 'backend/node_modules/**'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
})
