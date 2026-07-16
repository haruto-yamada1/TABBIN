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
        // Generated shadcn-style UI primitives are not hand-maintained.
        'src/components/ui/**',
        // ai-elements is a vendored UI kit. Its self-made input/output components
        // are now linted (see .oxlintrc.json per #657); per-file coverage is deferred
        // to a follow-up because raising the large kit to 100% is a separate effort.
        // Vendored display-only (storybook demo) components live under vendor/.
        'src/components/ai-elements/**',
        'src/components/storybook/**',
        // Self-made theme primitives were previously excluded by the src/components/**
        // blanket; kept out of coverage until they get dedicated tests.
        'src/components/ModeToggle.tsx',
        'src/components/ThemeProvider.tsx',
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
            'src/contexts/saved-tabs/presentation/app/**/*.test.ts',
            'src/contexts/saved-tabs/presentation/lib/scroll-controls.test.ts',
            'src/contexts/saved-tabs/presentation/services/modeSyncService.test.ts',
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
            'src/contexts/saved-tabs/presentation/lib/scroll-controls.test.ts',
            'src/contexts/saved-tabs/presentation/app/**/*.test.ts',
            'src/contexts/saved-tabs/presentation/services/modeSyncService.test.ts',
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
            'tools/**/*.test.ts',
          ],
        },
      },
    ],
  },
})
