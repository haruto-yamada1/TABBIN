export default {
  mutate: [
    'src/contexts/saved-tabs/domain/value-objects/Url.ts',
    'src/lib/persistence/jsonValue.ts',
    // Pilot the executable timestamp refinement and lossless transforms.
    // Mutating Zod discriminator constructors can prevent test collection;
    // those declarations are outside this initial measurement scope.
    'src/features/options/lib/import-export/v2/BackupV2Schema.ts:25-30',
    'src/features/options/lib/import-export/v2/BackupV2Schema.ts:68-82',
    'src/features/options/lib/import-export/v2/BackupV2Schema.ts:104-112',
    'src/features/options/lib/import-export/v2/BackupV2Schema.ts:131-147',
  ],
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  vitest: { configFile: 'vitest.mutation.config.ts', related: true },
  coverageAnalysis: 'perTest',
  concurrency: 1,
  timeoutMS: 5000,
  timeoutFactor: 1.5,
  dryRunTimeoutMinutes: 2,
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
  incremental: false,
  reporters: ['clear-text', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  ignorePatterns: [
    // This transpilation-only suite has its own alias config. Stryker 10's
    // tsconfig rewriter uses the removed TypeScript 7 compiler API; it has no
    // references to rewrite here. Normal `compile` still checks all sources.
    '/tsconfig.json',
    '/.wxt/**',
    '/.worktrees/**',
    '/.agents/**',
    '/.codex/**',
    '/.claude/**',
    '/.cursor/**',
    '/.output/**',
    '/coverage/**',
    '/test-results/**',
    '/playwright-report/**',
    '/storybook-static/**',
    '**/.env*',
    '**/*.recovery.json',
  ],
}
