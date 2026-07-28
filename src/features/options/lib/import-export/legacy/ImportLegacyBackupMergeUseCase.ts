import { mergeUserSettings } from '@/features/options/lib/import-export/settings-merge'
import type {
  BackupV2Inspection,
  BackupV2Preview,
} from '@/features/options/lib/import-export/v2/BackupV2Inspector'
import { collectBackupV2ResourceUsage } from '@/features/options/lib/import-export/v2/BackupV2ResourceUsage'
import type { BackupDataV2 } from '@/features/options/lib/import-export/v2/BackupV2Schema'
import type { UserSettings } from '@/types/storage'

import type { LegacyBackupV0 } from './LegacyBackupV0Schema'

type LegacyBackupPreview = Extract<
  BackupV2Preview,
  { readonly formatKind: 'legacy' }
>

export type LegacyBackupMergeInput = {
  readonly inspection: BackupV2Inspection & {
    readonly preview: LegacyBackupPreview
  }
  readonly userSettingsPatch: LegacyBackupV0['userSettings']
}

export type LegacyBackupMergeResult = {
  readonly entityCounts: LegacyBackupPreview['entityCounts']
  readonly revision: number | null
}

export type ImportLegacyBackupMergeDeps = {
  readonly commit: (
    plan: LegacyBackupMergeWritePlan,
    options: { readonly durability: 'strict' },
  ) => Promise<{ readonly revision: number }>
  readonly isHealthySavedTabs: (savedTabs: BackupDataV2['savedTabs']) => boolean
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

const hasLogicalRecords = (
  inspection: LegacyBackupMergeInput['inspection'],
): boolean =>
  Object.values(inspection.preview.entityCounts).some((count) => count > 0)

export const createImportLegacyBackupMergeUseCase = (
  deps: ImportLegacyBackupMergeDeps,
) => {
  return async ({
    inspection,
    userSettingsPatch,
  }: LegacyBackupMergeInput): Promise<LegacyBackupMergeResult> => {
    collectBackupV2ResourceUsage(inspection.data, 0)
    if (!deps.isHealthySavedTabs(inspection.data.savedTabs)) {
      throw new LegacyBackupMergeError()
    }

    const currentSettings = await deps.readUserSettings()
    const commitResult = hasLogicalRecords(inspection)
      ? await deps.commit(toWritePlan(inspection), { durability: 'strict' })
      : null
    await deps.writeUserSettings(
      mergeUserSettings(currentSettings, userSettingsPatch),
    )

    return {
      entityCounts: inspection.preview.entityCounts,
      revision: commitResult?.revision ?? null,
    }
  }
}
