import type { PersistenceLogicalSnapshot } from '@/contexts/saved-tabs/public-api'
import type {
  BackupV2Inspection,
  BackupV2Preview,
} from '@/features/options/lib/import-export/v2/BackupV2Inspector'
import { collectBackupV2ResourceUsage } from '@/features/options/lib/import-export/v2/BackupV2ResourceUsage'
import type { BackupDataV2 } from '@/features/options/lib/import-export/v2/BackupV2Schema'
import type { UserSettings } from '@/types/storage'

import type { LegacyBackupV0 } from './LegacyBackupV0Schema'
import { mergeUserSettings } from './settings-merge'

type LegacyBackupPreview = Extract<
  BackupV2Preview,
  { readonly formatKind: 'legacy' }
>

export type LegacyBackupMergeInput = {
  readonly inspection: BackupV2Inspection & {
    readonly preview: LegacyBackupPreview
  }
  readonly serializedBytes: number
  readonly userSettingsPatch: LegacyBackupV0['userSettings']
}

export type LegacyBackupMergeResult = {
  readonly addedEntityCounts: {
    readonly collections: number
    readonly groups: number
  }
  readonly entityCounts: LegacyBackupPreview['entityCounts']
  readonly revision: number | null
}

export type ImportLegacyBackupMergeDeps = {
  readonly commit: (
    plan: LegacyBackupMergeWritePlan,
    options: {
      readonly durability: 'strict'
      readonly expectedRevision: number
    },
  ) => Promise<{ readonly revision: number }>
  readonly hasBlockingSavedTabsIssues: (
    savedTabs: BackupDataV2['savedTabs'],
  ) => boolean
  readonly readSnapshot: () => Promise<PersistenceLogicalSnapshot>
  readonly readUserSettings: () => Promise<UserSettings>
  readonly writeUserSettings: (settings: UserSettings) => Promise<void>
}

type PutMutation<Value> = {
  readonly put: readonly Value[]
}

export type LegacyBackupMergeWritePlan = {
  readonly analyticsViews: PutMutation<BackupDataV2['analyticsViews'][number]>
  readonly categories: PutMutation<
    BackupDataV2['savedTabs']['categories'][number]
  >
  readonly collections: PutMutation<
    BackupDataV2['savedTabs']['collections'][number]
  >
  readonly conversations: PutMutation<BackupDataV2['conversations'][number]>
  readonly groups: PutMutation<BackupDataV2['savedTabs']['groups'][number]>
  readonly memberships: PutMutation<
    BackupDataV2['savedTabs']['memberships'][number]
  >
  readonly messages: PutMutation<BackupDataV2['messages'][number]>
  readonly urls: PutMutation<BackupDataV2['savedTabs']['urls'][number]>
}

export class LegacyBackupMergeError extends Error {
  readonly code: 'BACKUP_INTEGRITY_FAILED'

  constructor() {
    super('Legacy backup merge failed integrity validation')
    this.code = 'BACKUP_INTEGRITY_FAILED'
    this.name = 'LegacyBackupMergeError'
  }
}

const toWritePlan = (
  inspection: LegacyBackupMergeInput['inspection'],
): LegacyBackupMergeWritePlan => {
  const { data } = inspection
  return {
    analyticsViews: { put: data.analyticsViews },
    categories: { put: data.savedTabs.categories },
    collections: { put: data.savedTabs.collections },
    conversations: { put: data.conversations },
    groups: { put: data.savedTabs.groups },
    memberships: { put: data.savedTabs.memberships },
    messages: { put: data.messages },
    urls: { put: data.savedTabs.urls },
  }
}

const hasLogicalRecords = (data: BackupDataV2): boolean =>
  [
    data.analyticsViews,
    data.conversations,
    data.messages,
    data.savedTabs.categories,
    data.savedTabs.collections,
    data.savedTabs.groups,
    data.savedTabs.memberships,
    data.savedTabs.urls,
  ].some((records) => records.length > 0)

const countNewIds = (
  incoming: readonly { readonly id: string }[],
  existing: readonly { readonly id: string }[],
): number => {
  const existingIds = new Set(existing.map(({ id }) => id))
  return incoming.filter(({ id }) => !existingIds.has(id)).length
}

const mergeRecordsByKey = <Value>(
  current: readonly Value[],
  incoming: readonly Value[],
  keyOf: (value: Value) => string,
): readonly Value[] => {
  const merged = new Map(current.map((value) => [keyOf(value), value]))
  for (const value of incoming) {
    merged.set(keyOf(value), value)
  }
  return [...merged.values()]
}

const mergeSavedTabs = (
  current: BackupDataV2['savedTabs'],
  incoming: BackupDataV2['savedTabs'],
): BackupDataV2['savedTabs'] => ({
  categories: mergeRecordsByKey(
    current.categories,
    incoming.categories,
    ({ id }) => id,
  ),
  collections: mergeRecordsByKey(
    current.collections,
    incoming.collections,
    ({ id }) => id,
  ),
  groups: mergeRecordsByKey(current.groups, incoming.groups, ({ id }) => id),
  memberships: mergeRecordsByKey(
    current.memberships,
    incoming.memberships,
    ({ collectionId, urlId }) => JSON.stringify([collectionId, urlId]),
  ),
  urls: mergeRecordsByKey(current.urls, incoming.urls, ({ id }) => id),
})

export const createImportLegacyBackupMergeUseCase = (
  deps: ImportLegacyBackupMergeDeps,
) => {
  return async ({
    inspection,
    serializedBytes,
    userSettingsPatch,
  }: LegacyBackupMergeInput): Promise<LegacyBackupMergeResult> => {
    collectBackupV2ResourceUsage(inspection.data, serializedBytes)
    if (deps.hasBlockingSavedTabsIssues(inspection.data.savedTabs)) {
      throw new LegacyBackupMergeError()
    }

    const [currentSnapshot, currentSettings] = await Promise.all([
      deps.readSnapshot(),
      deps.readUserSettings(),
    ])
    if (
      deps.hasBlockingSavedTabsIssues(
        mergeSavedTabs(currentSnapshot.savedTabs, inspection.data.savedTabs),
      )
    ) {
      throw new LegacyBackupMergeError()
    }
    const commitResult = hasLogicalRecords(inspection.data)
      ? await deps.commit(toWritePlan(inspection), {
          durability: 'strict',
          expectedRevision: currentSnapshot.revision,
        })
      : null
    await deps.writeUserSettings(
      mergeUserSettings(currentSettings, userSettingsPatch),
    )

    return {
      addedEntityCounts: {
        collections: countNewIds(
          inspection.data.savedTabs.collections,
          currentSnapshot.savedTabs.collections,
        ),
        groups: countNewIds(
          inspection.data.savedTabs.groups,
          currentSnapshot.savedTabs.groups,
        ),
      },
      entityCounts: inspection.preview.entityCounts,
      revision: commitResult?.revision ?? null,
    }
  }
}
