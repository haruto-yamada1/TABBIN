import { defaultSettings } from '@/lib/storage/settings'

import type { BackupImportSelection } from './BackupV2ImportDiff'
import { countBackupV2Entities } from './BackupV2Inspector'
import type { BackupPreviewEntityCounts } from './BackupV2Inspector'
import { BackupEnvelopeV2Schema } from './BackupV2Schema'
import type { BackupDataV2, BackupEnvelopeV2 } from './BackupV2Schema'

export type BackupExportSelection = {
  readonly sections: BackupImportSelection
  readonly collectionIds: readonly string[]
  readonly includeUncollectedUrls: boolean
}

export const createBackupExportSelection = (
  backup: BackupEnvelopeV2,
): BackupExportSelection => ({
  sections: {
    savedTabs: false,
    userSettings: false,
    aiChat: false,
    analyticsViews: false,
  },
  collectionIds: backup.data.savedTabs.collections.map(({ id }) => id),
  includeUncollectedUrls: true,
})

const selectSavedTabs = (
  savedTabs: BackupDataV2['savedTabs'],
  selection: BackupExportSelection,
): BackupDataV2['savedTabs'] => {
  if (!selection.sections.savedTabs) {
    return {
      categories: [],
      collections: [],
      groups: [],
      memberships: [],
      urls: [],
    }
  }

  const collectionIds = new Set(selection.collectionIds)
  if (
    selection.includeUncollectedUrls &&
    savedTabs.collections.every(({ id }) => collectionIds.has(id))
  ) {
    // A complete backup also preserves groups without any collections.
    return savedTabs
  }

  const collections = savedTabs.collections.filter(({ id }) =>
    collectionIds.has(id),
  )
  const selectedCollectionIds = new Set(collections.map(({ id }) => id))
  const memberships = savedTabs.memberships.filter(({ collectionId }) =>
    selectedCollectionIds.has(collectionId),
  )
  const selectedUrlIds = new Set(memberships.map(({ urlId }) => urlId))
  const collectedUrlIds = new Set(
    savedTabs.memberships.map(({ urlId }) => urlId),
  )
  const groupIds = new Set(collections.map(({ groupId }) => groupId))

  return {
    categories: savedTabs.categories.filter(({ collectionId }) =>
      selectedCollectionIds.has(collectionId),
    ),
    collections,
    groups: savedTabs.groups.filter(({ id }) => groupIds.has(id)),
    memberships,
    urls: savedTabs.urls.filter(
      ({ id }) =>
        selectedUrlIds.has(id) ||
        (selection.includeUncollectedUrls && !collectedUrlIds.has(id)),
    ),
  }
}

export const prepareBackupExport = (
  backup: BackupEnvelopeV2,
  selection: BackupExportSelection,
): {
  readonly envelope: BackupEnvelopeV2
  readonly counts: BackupPreviewEntityCounts
} => {
  const { sections } = selection
  const envelope = BackupEnvelopeV2Schema.parse({
    ...backup,
    data: {
      analyticsViews: sections.analyticsViews ? backup.data.analyticsViews : [],
      conversations: sections.aiChat ? backup.data.conversations : [],
      messages: sections.aiChat ? backup.data.messages : [],
      savedTabs: selectSavedTabs(backup.data.savedTabs, selection),
      userSettings: sections.userSettings
        ? backup.data.userSettings
        : defaultSettings,
    },
  })
  return { envelope, counts: countBackupV2Entities(envelope.data) }
}
