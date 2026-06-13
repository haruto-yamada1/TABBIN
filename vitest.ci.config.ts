import path from 'node:path'

import { defineConfig } from 'vitest/config'

const dirname = import.meta.dirname

const alias = {
  '@': path.resolve(dirname, './src'),
}

const sharedExclude = [
  '**/node_modules/**',
  '**/dist/**',
  '**/e2e/**',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  'tests/**',
  'tests-examples/**',
  'storybook-static/**',
  '**/.{idea,git,cache,output,temp}/**',
]

const sharedSetupFiles = ['./src/test/setup-console.ts']

export default defineConfig({
  resolve: {
    alias,
  },
  test: {
    coverage: {
      exclude: [
        '.storybook/**',
        '**/*.stories.ts',
        '**/*.stories.tsx',
        '**/*.css',
        'src/components/**',
        'src/components/storybook/**',
        'constants/defaultColors.ts',
        'entrypoints/options/main.tsx',
        'lib/storybook/**',
      ],
    },
    pool: 'threads',
    isolate: false,
    testTimeout: 15000,
    projects: [
      {
        resolve: {
          alias,
        },
        test: {
          name: 'dom',
          environment: 'happy-dom',
          setupFiles: sharedSetupFiles,
          exclude: sharedExclude,
          include: [
            'src/**/*.test.tsx',
            'src/components/**/*.test.ts',
            'src/entrypoints/**/*.test.ts',
            'src/features/saved-tabs/app/**/*.test.ts',
            'src/features/saved-tabs/lib/scroll-controls.test.ts',
            'src/features/saved-tabs/shared/services/modeSyncService.test.ts',
            'src/features/options/ImportFileDialog.test.ts',
            'src/features/ai-chat/hooks/useSharedAiChatHistory.test.ts',
            'src/lib/storybook/browser-mocks.test.ts',
          ],
        },
      },
      {
        resolve: {
          alias,
        },
        test: {
          name: 'node',
          environment: 'node',
          setupFiles: sharedSetupFiles,
          exclude: [
            ...sharedExclude,
            'src/features/saved-tabs/lib/scroll-controls.test.ts',
            'src/features/saved-tabs/app/**/*.test.ts',
            'src/features/saved-tabs/shared/services/modeSyncService.test.ts',
            'src/features/options/ImportFileDialog.test.ts',
            'src/features/ai-chat/hooks/useSharedAiChatHistory.test.ts',
            'src/lib/storybook/browser-mocks.test.ts',
          ],
          include: [
            'src/lib/**/*.test.ts',
            'src/utils/**/*.test.ts',
            'src/constants/**/*.test.ts',
            'src/contexts/**/*.test.ts',
            'src/app/**/*.test.ts',
            'src/features/**/lib/**/*.test.ts',
            'src/features/i18n/lib/**/*.test.ts',
            'src/features/analytics/**/*.test.ts',
          ],
        },
      },
    ],
  },
})
