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

// `isolate: false` is retained deliberately for CI speed: a single module
// registry per thread runs the full suite in ~18s vs ~36s with `isolate: true`.
// Verified safe under issue #668:
//   - `isolate: true` passes all 3529 tests (no hidden module dependency).
//   - `--sequence.shuffle.files` passes under `isolate: false` (no cross-file
//     order dependency).
// Defence-in-depth is provided by `src/test/setup-global-state.ts`, which
// resets `globalThis.chrome`, Web Storage, and stubbed globals after every
// test so a file that forgets to clean up cannot poison the next.
// Module-level singleton cache reset strategy is documented in
// `src/test/setup-global-state.ts` (prefer the owning module's reset
// helper such as `invalidateUrlCache`, or `vi.resetModules()` + fresh
// dynamic import for a fully fresh singleton).
const sharedSetupFiles = [
  './src/test/setup-console.ts',
  './src/test/setup-global-state.ts',
]

export default defineConfig({
  resolve: {
    alias,
  },
  test: {
    coverage: {
      // Coverage thresholds — see docs/testing/coverage-thresholds.md
      //
      // Global thresholds are set deliberately below current coverage (~97%
      // statements/lines, ~92% branches, ~98% functions) to give a buffer for
      // normal fluctuation while catching significant regressions.
      //
      // Per-glob thresholds protect critical domains (storage, background,
      // import-export, ai-chat, i18n) with tighter floors so a drop in these
      // areas is detected even when global coverage stays above the floor.
      // Thresholds were calibrated from the coverage baseline measured in #679
      // and should be revisited when coverage improves.
      thresholds: {
        // Global floor — catches project-wide coverage erosion.
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,

        // Critical storage layer — tab/URL/project persistence.
        'src/lib/storage/**': {
          statements: 95,
          branches: 88,
          functions: 90,
          lines: 95,
        },
        // Background service logic — alarms, notifications, expired tabs.
        'src/lib/background/**': {
          statements: 95,
          branches: 90,
          functions: 95,
          lines: 95,
        },
        // Import/export flows — user data round-trip integrity.
        'src/features/options/lib/import-export/**': {
          statements: 95,
          branches: 90,
          functions: 95,
          lines: 95,
        },
        // AI chat core logic — route parsing, history management.
        'src/features/ai-chat/lib/**': {
          statements: 95,
          branches: 85,
          functions: 95,
          lines: 95,
        },
        // i18n — language detection, provider, translation utils.
        'src/features/i18n/**': {
          statements: 90,
          branches: 75,
          functions: 95,
          lines: 90,
        },
      },
      exclude: [
        '.storybook/**',
        '**/*.stories.ts',
        '**/*.stories.tsx',
        // Test-only compatibility fixtures are exercised through their consumers;
        // they are not production modules and must not dilute production thresholds.
        '**/*.fixture.ts',
        '**/*.fixture.tsx',
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
            'src/test/**/*.test.ts',
            'tools/**/*.test.ts',
          ],
        },
      },
    ],
  },
})
