import { describe, expect, it } from 'vitest'

import { defaultSettings } from '@/lib/storage/settings'
import {
  createCustomCollectionFixture,
  createDomainCollectionFixture,
  createMembershipFixture,
  createUrlFixture,
} from '@/test/fixtures/persistenceBrowserFixtures'

import {
  createBackupExportSelection,
  prepareBackupExport,
} from './BackupV2ExportSelection'
import type { BackupExportSelection } from './BackupV2ExportSelection'
import { ALL_BACKUP_IMPORT_SECTIONS } from './BackupV2ImportDiff'
import { inspectBackupV2 } from './BackupV2Inspector'
import { BackupEnvelopeV2Schema } from './BackupV2Schema'
import type { BackupEnvelopeV2 } from './BackupV2Schema'
import backupFixture from './fixtures/backup-v2-current.json'

const createBackup = (): BackupEnvelopeV2 =>
  BackupEnvelopeV2Schema.parse({
    ...backupFixture,
    data: {
      ...backupFixture.data,
      analyticsViews: [
        { id: 'view', updatedAt: 1, value: { title: 'private analysis' } },
      ],
      conversations: [
        { id: 'chat', updatedAt: 1, value: { title: 'private conversation' } },
      ],
      messages: [
        {
          conversationId: 'chat',
          createdAt: 1,
          id: 'message',
          value: { content: 'private message' },
        },
      ],
      savedTabs: {
        categories: ['public', 'secret'].map((collectionId) => ({
          collectionId,
          createdAt: 1,
          id: `category-${collectionId}`,
          keywords: [`${collectionId} keyword`],
          name: `${collectionId} category`,
          sortOrder: 0,
          updatedAt: 1,
        })),
        collections: [
          {
            ...createDomainCollectionFixture('public', 'public.example', 1),
            groupId: 'group-public',
          },
          {
            ...createCustomCollectionFixture('secret', 'secret project', 1),
            groupId: 'group-secret',
          },
        ],
        groups: ['public', 'secret', 'empty'].map((id) => ({
          createdAt: 1,
          id: `group-${id}`,
          name: `${id} group`,
          sortOrder: 0,
          updatedAt: 1,
        })),
        memberships: [
          {
            ...createMembershipFixture('public', 'shared', 1),
            categoryId: 'category-public',
            notes: 'public note',
          },
          {
            ...createMembershipFixture('secret', 'shared', 1),
            categoryId: 'category-secret',
            notes: 'secret note on shared URL',
          },
          createMembershipFixture('secret', 'secret-url', 1),
        ],
        urls: [
          {
            ...createUrlFixture(
              'shared',
              'https://public.example/',
              'Public',
              1,
            ),
            isFavorite: true,
          },
          createUrlFixture(
            'secret-url',
            'https://secret.example/?token=private',
            'Secret',
            1,
          ),
          createUrlFixture('uncollected', 'https://loose.example/', 'Loose', 1),
        ],
      },
      userSettings: {
        ...backupFixture.data.userSettings,
        excludePatterns: ['private setting'],
        ollamaModel: 'private model',
      },
    },
  })

const allSelection = (backup: BackupEnvelopeV2): BackupExportSelection => ({
  ...createBackupExportSelection(backup),
  sections: ALL_BACKUP_IMPORT_SECTIONS,
})

describe('Backup V2 export selection', () => {
  it('requires an explicit choice for every section', () => {
    const backup = createBackup()
    expect(createBackupExportSelection(backup)).toEqual({
      sections: {
        savedTabs: false,
        userSettings: false,
        aiChat: false,
        analyticsViews: false,
      },
      collectionIds: ['public', 'secret'],
      includeUncollectedUrls: true,
    })
  })

  it('removes all unselected personal data and uses only default settings', () => {
    const backup = createBackup()
    const { envelope, counts } = prepareBackupExport(
      backup,
      createBackupExportSelection(backup),
    )

    expect(envelope.data.savedTabs).toEqual({
      categories: [],
      collections: [],
      groups: [],
      memberships: [],
      urls: [],
    })
    expect(envelope.data.conversations).toEqual([])
    expect(envelope.data.messages).toEqual([])
    expect(envelope.data.analyticsViews).toEqual([])
    expect(envelope.data.userSettings).toEqual(defaultSettings)
    expect(JSON.stringify(envelope)).not.toContain('private')
    expect(counts).toEqual({
      analyticsViews: 0,
      categories: 0,
      collections: 0,
      conversations: 0,
      groups: 0,
      memberships: 0,
      messages: 0,
      urls: 0,
    })
    expect(inspectBackupV2(envelope).preview.entityCounts).toEqual(counts)
  })

  it('filters collection dependencies without leaking excluded URLs or notes', () => {
    const backup = createBackup()
    const { envelope, counts } = prepareBackupExport(backup, {
      ...allSelection(backup),
      collectionIds: ['public', 'unknown'],
      includeUncollectedUrls: false,
    })

    expect(envelope.data.savedTabs).toEqual({
      categories: [backup.data.savedTabs.categories[0]],
      collections: [backup.data.savedTabs.collections[0]],
      groups: [backup.data.savedTabs.groups[0]],
      memberships: [backup.data.savedTabs.memberships[0]],
      urls: [backup.data.savedTabs.urls[0]],
    })
    expect(JSON.stringify(envelope.data.savedTabs)).not.toContain('secret')
    expect(JSON.stringify(envelope.data.savedTabs)).not.toContain('loose')
    expect(counts).toMatchObject({
      urls: 1,
      collections: 1,
      memberships: 1,
      categories: 1,
      groups: 1,
    })
    expect(inspectBackupV2(envelope).preview.entityCounts).toEqual(counts)
  })

  it('includes uncollected URLs only when chosen and keeps shared URLs once', () => {
    const backup = createBackup()
    const selected = allSelection(backup)
    const publicOnly = prepareBackupExport(backup, {
      ...selected,
      collectionIds: ['public'],
    })
    expect(publicOnly.envelope.data.savedTabs.urls.map(({ id }) => id)).toEqual(
      ['shared', 'uncollected'],
    )
    expect(publicOnly.counts.urls).toBe(2)

    const uncollectedOnly = prepareBackupExport(backup, {
      ...selected,
      collectionIds: [],
    })
    expect(uncollectedOnly.envelope.data.savedTabs.urls).toEqual([
      backup.data.savedTabs.urls[2],
    ])
    expect(uncollectedOnly.counts).toMatchObject({
      urls: 1,
      collections: 0,
      memberships: 0,
      groups: 0,
      categories: 0,
    })

    const none = prepareBackupExport(backup, {
      ...selected,
      collectionIds: [],
      includeUncollectedUrls: false,
    })
    expect(none.counts.urls).toBe(0)

    const both = prepareBackupExport(backup, {
      ...selected,
      includeUncollectedUrls: false,
    })
    expect(both.envelope.data.savedTabs.urls.map(({ id }) => id)).toEqual([
      'shared',
      'secret-url',
    ])
    expect(both.counts.urls).toBe(2)
  })

  it('reproduces a complete backup including empty groups without mutating input', () => {
    const backup = createBackup()
    const before = structuredClone(backup)
    const { envelope, counts } = prepareBackupExport(
      backup,
      allSelection(backup),
    )

    expect(envelope).toEqual(before)
    expect(backup).toEqual(before)
    expect(counts).toEqual(inspectBackupV2(before).preview.entityCounts)
    expect(inspectBackupV2(JSON.stringify(envelope)).data).toEqual(before.data)
  })

  it.each(['savedTabs', 'userSettings', 'aiChat', 'analyticsViews'] as const)(
    'selects %s independently from the other sections',
    (section) => {
      const backup = createBackup()
      const selection = createBackupExportSelection(backup)
      const { envelope } = prepareBackupExport(backup, {
        ...selection,
        sections: { ...selection.sections, [section]: true },
      })

      expect(envelope.data.savedTabs.urls.length > 0).toBe(
        section === 'savedTabs',
      )
      expect(envelope.data.conversations.length > 0).toBe(section === 'aiChat')
      expect(envelope.data.messages.length > 0).toBe(section === 'aiChat')
      expect(envelope.data.analyticsViews.length > 0).toBe(
        section === 'analyticsViews',
      )
      expect(envelope.data.userSettings).toEqual(
        section === 'userSettings' ? backup.data.userSettings : defaultSettings,
      )
    },
  )
})
