import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const dirname = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(dirname, './src'),
    },
  },
  test: {
    coverage: {
      exclude: [
        '.storybook/**',
        '**/*.stories.ts',
        '**/*.stories.tsx',
        '**/*.css',
        'components/storybook/**',
        'components/**',
        'constants/defaultColors.ts',
        'entrypoints/options/main.tsx',
        'lib/storybook/**',
      ],
    },
    environment: 'jsdom',
    setupFiles: ['./src/test/setup-console.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      'tests/**',
      'tests-examples/**',
      'storybook-static/**',
      '**/.{idea,git,cache,output,temp}/**',
    ],
    include: [
      'src/entrypoints/**/*.test.ts',
      'src/entrypoints/**/*.test.tsx',
      'src/components/**/*.test.ts',
      'src/components/**/*.test.tsx',
      'src/features/**/*.test.ts',
      'src/features/**/*.test.tsx',
      'src/hooks/**/*.test.ts',
      'src/hooks/**/*.test.tsx',
      'src/lib/**/*.test.ts',
      'src/lib/**/*.test.tsx',
      'src/utils/**/*.test.ts',
      'src/utils/**/*.test.tsx',
    ],
  },
})
