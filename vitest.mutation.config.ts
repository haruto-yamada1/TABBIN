import path from 'node:path'

import { defineConfig } from 'vitest/config'

// Pure boundary tests only. Keep the normal projects and coverage gates intact.
export default defineConfig({
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  test: {
    environment: 'node',
    isolate: true,
    include: [
      'src/contexts/saved-tabs/domain/value-objects/Url.test.ts',
      'src/contexts/saved-tabs/domain/services/UrlIdentityPolicy.test.ts',
      'src/lib/persistence/jsonValue.test.ts',
      'src/features/options/lib/import-export/v2/BackupV2Schema.test.ts',
    ],
  },
})
