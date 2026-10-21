import { BackupMapper } from './BackupMapper'
import type { BackupDataV2 } from './BackupV2Schema'

export const BACKUP_IMPORT_SECTIONS = [
  'savedTabs',
  'userSettings',
  'aiChat',
  'analyticsViews',
] as const
export type BackupImportSection = (typeof BACKUP_IMPORT_SECTIONS)[number]
export type BackupImportSelection = Readonly<
  Record<BackupImportSection, boolean>
>
export const ALL_BACKUP_IMPORT_SECTIONS: BackupImportSelection = {
  savedTabs: true,
  userSettings: true,
  aiChat: true,
  analyticsViews: true,
}
export type BackupImportCurrent = {
  readonly data: BackupDataV2
  readonly revision: number
}
export type BackupImportOptions = {
  readonly current: BackupImportCurrent
  readonly selection: BackupImportSelection
}
export type BackupImportChange = {
  readonly section: BackupImportSection
  readonly entity: string
  readonly id: string
  readonly kind: 'added' | 'updated' | 'deleted'
  readonly before: string
  readonly after: string
}

export const selectBackupImportData = (
  current: BackupDataV2,
  incoming: BackupDataV2,
  selection: BackupImportSelection,
): BackupDataV2 => ({
  savedTabs: selection.savedTabs ? incoming.savedTabs : current.savedTabs,
  userSettings: selection.userSettings
    ? incoming.userSettings
    : current.userSettings,
  conversations: selection.aiChat
    ? incoming.conversations
    : current.conversations,
  messages: selection.aiChat ? incoming.messages : current.messages,
  analyticsViews: selection.analyticsViews
    ? incoming.analyticsViews
    : current.analyticsViews,
})

type DiffRecord = {
  readonly key: string
  readonly label: string
  readonly value: unknown
}
const recordLabel = (record: Readonly<Record<string, unknown>>): string => {
  for (const key of ['title', 'name', 'url']) {
    if (typeof record[key] === 'string' && record[key]) {
      return record[key]
    }
  }
  const value = record.value
  if (
    typeof value === 'object' &&
    value !== null &&
    'title' in value &&
    typeof value.title === 'string'
  ) {
    return value.title
  }
  return ''
}
const records = (data: BackupDataV2) => {
  const urlLabels = new Map(
    data.savedTabs.urls.map((url) => [url.id, url.title || url.url]),
  )
  const collectionLabels = new Map(
    data.savedTabs.collections.map((collection) => [
      collection.id,
      collection.name,
    ]),
  )
  return [
    ...(
      ['urls', 'collections', 'categories', 'groups', 'memberships'] as const
    ).map((entity) => ({
      section: 'savedTabs' as const,
      entity,
      entries: data.savedTabs[entity].map((entry): DiffRecord => ({
        key:
          'id' in entry
            ? entry.id
            : JSON.stringify([entry.collectionId, entry.urlId]),
        label:
          'urlId' in entry
            ? `${urlLabels.get(entry.urlId) ?? entry.urlId} · ${collectionLabels.get(entry.collectionId) ?? entry.collectionId}`
            : recordLabel(entry),
        value: entry,
      })),
    })),
    ...(['conversations', 'messages', 'analyticsViews'] as const).map(
      (entity) => ({
        section:
          entity === 'analyticsViews'
            ? ('analyticsViews' as const)
            : ('aiChat' as const),
        entity,
        entries: data[entity].map((entry): DiffRecord => ({
          key: entry.id,
          label: recordLabel(entry),
          value: entry,
        })),
      }),
    ),
    {
      section: 'userSettings' as const,
      entity: 'userSettings',
      entries: Object.entries(data.userSettings).map(
        ([key, value]): DiffRecord => ({ key, label: key, value }),
      ),
    },
  ]
}

/** Canonical comparison ignores record order and JSON object key order. No values leave local memory. */
export const createBackupImportDiff = (
  current: BackupDataV2,
  incoming: BackupDataV2,
): readonly BackupImportChange[] => {
  const canonicalize = (data: BackupDataV2) =>
    BackupMapper.toBackupData(
      BackupMapper.toLogicalSnapshot(data, 0),
      data.userSettings,
    )
  const beforeSections = records(canonicalize(current))
  const afterSections = records(canonicalize(incoming))
  const changes: BackupImportChange[] = []
  for (const afterSection of afterSections) {
    const beforeSection = beforeSections.find(
      ({ entity }) => entity === afterSection.entity,
    )
    const beforeByKey = new Map(
      beforeSection?.entries.map((entry) => [entry.key, entry]),
    )
    for (const after of afterSection.entries) {
      const before = beforeByKey.get(after.key)
      beforeByKey.delete(after.key)
      if (
        !before ||
        JSON.stringify(before.value) !== JSON.stringify(after.value)
      ) {
        changes.push({
          section: afterSection.section,
          entity: afterSection.entity,
          id: after.key,
          kind: before ? 'updated' : 'added',
          before: before?.label ?? '',
          after: after.label,
        })
      }
    }
    for (const before of beforeByKey.values()) {
      changes.push({
        section: afterSection.section,
        entity: afterSection.entity,
        id: before.key,
        kind: 'deleted',
        before: before.label,
        after: '',
      })
    }
  }
  return changes
}
