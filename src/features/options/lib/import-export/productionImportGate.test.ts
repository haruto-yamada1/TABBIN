import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import type { BackupSchemaError } from '@/lib/persistence/backupSchema'

import type { LegacyBackupImportError } from './legacy/LegacyBackupAdapter'
import { assertProductionImportAllowed } from './productionImportGate'
import type { ProductionBackupImportError } from './productionImportGate'

const readFixture = (name: string): string =>
  readFileSync(new URL(`v2/fixtures/${name}`, import.meta.url), 'utf8')

const captureError = (action: () => unknown): Error => {
  try {
    action()
  } catch (error) {
    if (error instanceof Error) {
      return error
    }
  }
  throw new Error('Expected action to throw')
}

describe('assertProductionImportAllowed', () => {
  it('strictly validates current V2 and routes overwrite through recovery', () => {
    const allowed = assertProductionImportAllowed(
      readFixture('backup-v2-current.json'),
      {
        importDate: '2026-07-28',
        importMode: 'overwrite',
      },
    )

    expect(allowed).toMatchObject({
      inspection: {
        preview: { formatKind: 'current-v2' },
      },
      kind: 'v2-overwrite',
    })
  })

  it('keeps current V2 merge fail-closed because it has no merge contract', () => {
    const error = captureError(() =>
      assertProductionImportAllowed(readFixture('backup-v2-current.json'), {
        importDate: '2026-07-28',
        importMode: 'merge',
      }),
    )

    expect(error).toMatchObject<Partial<ProductionBackupImportError>>({
      code: 'CURRENT_V2_MERGE_UNAVAILABLE',
      name: 'ProductionBackupImportError',
    })
    expect(JSON.stringify(error)).not.toContain('userSettings')
  })

  it('preserves the typed future-schema rejection', () => {
    const error = captureError(() =>
      assertProductionImportAllowed(readFixture('backup-v2-future.json'), {
        importDate: '2026-07-28',
        importMode: 'overwrite',
      }),
    )

    expect(error).toMatchObject<Partial<BackupSchemaError>>({
      code: 'UNSUPPORTED_FUTURE_SCHEMA',
      currentVersion: 2,
      name: 'BackupSchemaError',
      receivedVersion: 3,
    })
  })

  it('rejects malformed versioned input before legacy handling', () => {
    const error = captureError(() =>
      assertProductionImportAllowed(
        JSON.stringify({ schemaVersion: 2, privatePayload: 'secret' }),
        { importDate: '2026-07-28', importMode: 'overwrite' },
      ),
    )

    expect(error).toMatchObject<Partial<BackupSchemaError>>({
      code: 'INVALID_SCHEMA',
      name: 'BackupSchemaError',
    })
    expect(JSON.stringify(error)).not.toContain('secret')
  })

  it('rejects malformed legacy-shaped input before compatibility parsing', () => {
    const error = captureError(() =>
      assertProductionImportAllowed(
        JSON.stringify({
          parentCategories: [],
          privatePayload: 'secret',
          savedTabs: [],
          timestamp: '2026-07-28T00:00:00.000Z',
          userSettings: {},
          version: '1.0.0',
        }),
        { importDate: '2026-09-30', importMode: 'merge' },
      ),
    )

    expect(error).toMatchObject<Partial<BackupSchemaError>>({
      code: 'INVALID_SCHEMA',
      name: 'BackupSchemaError',
    })
    expect(JSON.stringify(error)).not.toContain('secret')
  })

  it('allows legacy through the last date and rejects it at the cutoff', () => {
    const legacy = readFixture('legacy-tab-group-url-ids.json')

    const allowed = assertProductionImportAllowed(legacy, {
      importDate: '2026-09-30',
      importMode: 'merge',
    })
    expect(allowed).toMatchObject({
      inspection: {
        preview: { formatKind: 'legacy' },
      },
      kind: 'legacy-merge',
      serializedBytes: new TextEncoder().encode(legacy).byteLength,
      userSettingsPatch: expect.any(Object),
    })

    const error = captureError(() =>
      assertProductionImportAllowed(legacy, {
        importDate: '2026-10-01',
        importMode: 'merge',
      }),
    )
    expect(error).toMatchObject<Partial<LegacyBackupImportError>>({
      code: 'LEGACY_IMPORT_CUTOFF_REACHED',
      name: 'LegacyBackupImportError',
    })
  })

  it('accepts official 1.2.4 settings without forwarding retired AI provider fields', () => {
    const allowed = assertProductionImportAllowed(
      readFixture('legacy-v1.2.4-user-settings.json'),
      {
        importDate: '2026-09-30',
        importMode: 'merge',
      },
    )
    if (allowed?.kind !== 'legacy-merge') {
      throw new TypeError('Expected legacy merge import')
    }

    expect(allowed.userSettingsPatch).toMatchObject({
      activeAiSystemPromptId: 'default-system-prompt',
      clickBehavior: 'saveSameDomainTabs',
    })
    expect(allowed.userSettingsPatch).not.toHaveProperty('aiChatEnabled')
    expect(allowed.userSettingsPatch).not.toHaveProperty('aiProvider')
  })

  it('accepts the legacy exporter runtime prompt without forwarding it to settings', () => {
    const legacy: unknown = JSON.parse(
      readFixture('legacy-tab-group-url-ids.json'),
    )
    if (typeof legacy !== 'object' || legacy === null) {
      throw new TypeError('Expected legacy backup fixture')
    }
    const userSettings = Reflect.get(legacy, 'userSettings')
    if (typeof userSettings !== 'object' || userSettings === null) {
      throw new TypeError('Expected legacy user settings fixture')
    }
    const activeAiSystemPrompt = {
      createdAt: 1,
      id: 'legacy-active-prompt',
      name: 'Legacy active prompt',
      template: 'Legacy prompt template',
      updatedAt: 2,
    }
    Object.assign(userSettings, {
      activeAiSystemPrompt,
      activeAiSystemPromptId: activeAiSystemPrompt.id,
      aiSystemPrompts: [activeAiSystemPrompt],
    })

    const allowed = assertProductionImportAllowed(JSON.stringify(legacy), {
      importDate: '2026-09-30',
      importMode: 'merge',
    })
    if (allowed?.kind !== 'legacy-merge') {
      throw new TypeError('Expected legacy merge import')
    }

    expect(allowed.userSettingsPatch).toMatchObject({
      activeAiSystemPromptId: activeAiSystemPrompt.id,
      aiSystemPrompts: [activeAiSystemPrompt],
    })
    expect(allowed.userSettingsPatch).not.toHaveProperty('activeAiSystemPrompt')
  })

  it('accepts schema-less backups containing versioned analytics queries', () => {
    const legacy: unknown = JSON.parse(
      readFixture('legacy-tab-group-url-ids.json'),
    )
    if (typeof legacy !== 'object' || legacy === null) {
      throw new TypeError('Expected legacy backup fixture')
    }
    Object.assign(legacy, {
      savedAnalyticsViews: [
        {
          createdAt: 1,
          id: 'view-v2-query',
          name: 'Collection activity',
          query: {
            chartType: 'bar',
            collectionType: 'domain',
            compareBy: 'none',
            filters: {
              excludedDomains: [],
              excludedParentCategories: [],
              excludedProjectCategories: [],
              excludedProjects: [],
              excludedSubCategories: [],
              includedDomains: [],
              includedParentCategories: [],
              includedProjectCategories: [],
              includedProjects: [],
              includedSubCategories: [],
            },
            groupBy: 'collection',
            limit: 10,
            metric: 'membership-added',
            mode: 'both',
            normalize: false,
            schemaVersion: 2,
            sort: 'value-desc',
            stacked: false,
            timeBucket: 'day',
            timeRange: '30d',
          },
          updatedAt: 2,
        },
      ],
    })

    expect(
      assertProductionImportAllowed(JSON.stringify(legacy), {
        importDate: '2026-09-30',
        importMode: 'merge',
      }),
    ).toMatchObject({
      inspection: { preview: { formatKind: 'legacy' } },
      kind: 'legacy-merge',
    })
  })

  it('routes a supported legacy overwrite through normalized recovery', () => {
    const allowed = assertProductionImportAllowed(
      readFixture('legacy-tab-group-url-ids.json'),
      {
        importDate: '2026-09-30',
        importMode: 'overwrite',
      },
    )

    expect(allowed).toMatchObject({
      inspection: {
        preview: { formatKind: 'legacy' },
      },
      kind: 'v2-overwrite',
    })
  })

  it('does not accept an omitted import date', () => {
    const legacy = readFixture('legacy-tab-group-url-ids.json')
    const callWithoutDate = assertProductionImportAllowed as (
      input: string,
    ) => void

    expect(() => callWithoutDate(legacy)).toThrow('Import date is required')
  })

  it('leaves malformed JSON to the existing legacy format-error path', () => {
    expect(() =>
      assertProductionImportAllowed('{malformed-json', {
        importDate: '2026-07-28',
        importMode: 'overwrite',
      }),
    ).not.toThrow()
  })
})
