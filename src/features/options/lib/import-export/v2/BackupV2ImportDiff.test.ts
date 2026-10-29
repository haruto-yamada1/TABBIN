import { describe, expect, it } from 'vitest'

import {
  ALL_BACKUP_IMPORT_SECTIONS,
  createBackupImportDiff,
  selectBackupImportData,
} from './BackupV2ImportDiff'
import { inspectBackupV2 } from './BackupV2Inspector'
import backup from './fixtures/backup-v2-current.json'

const createData = () => inspectBackupV2(backup).data
const url = (id: string, title = id) => ({
  id,
  title,
  url: `https://${id}.example/`,
  normalizedUrl: `https://${id}.example/`,
  firstSavedAt: 1,
  lastSavedAt: 1,
  updatedAt: 1,
})

describe('Backup V2 import comparison', () => {
  it('identifies added, updated and deleted items including composite memberships and settings', () => {
    const data = createData()
    const membership = {
      addedAt: 1,
      collectionId: 'c',
      sortOrder: 1,
      updatedAt: 1,
      urlId: 'same',
      notes: 'before',
    }
    const current = {
      ...data,
      savedTabs: {
        ...data.savedTabs,
        urls: [url('removed'), url('same', 'Old title')],
        memberships: [membership],
      },
      userSettings: { ...data.userSettings, language: 'en' as const },
    }
    const incoming = {
      ...current,
      savedTabs: {
        ...current.savedTabs,
        urls: [url('same', 'New title'), url('added')],
        memberships: [{ ...membership, notes: 'after' }],
      },
      userSettings: { ...current.userSettings, language: 'ja' as const },
    }
    const changes = createBackupImportDiff(current, incoming)
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          entity: 'urls',
          id: 'removed',
          kind: 'deleted',
          before: 'removed',
        }),
        expect.objectContaining({
          entity: 'urls',
          id: 'added',
          kind: 'added',
          after: 'added',
        }),
        expect.objectContaining({
          entity: 'urls',
          id: 'same',
          kind: 'updated',
          before: 'Old title',
          after: 'New title',
        }),
        expect.objectContaining({
          entity: 'memberships',
          id: '["c","same"]',
          kind: 'updated',
        }),
        expect.objectContaining({
          entity: 'userSettings',
          id: 'language',
          kind: 'updated',
        }),
      ]),
    )
    expect(changes).toHaveLength(5)
  })

  it('ignores entity order and nested JSON key order without losing a real conversation update', () => {
    const data = createData()
    const current = {
      ...data,
      savedTabs: { ...data.savedTabs, urls: [url('one'), url('two')] },
      conversations: [
        {
          id: 'chat',
          updatedAt: 1,
          value: { title: 'Chat', nested: { a: 1, b: 2 } },
        },
      ],
    }
    const incoming = {
      ...current,
      savedTabs: {
        ...current.savedTabs,
        urls: current.savedTabs.urls.toReversed(),
      },
      conversations: [
        {
          id: 'chat',
          updatedAt: 1,
          value: { nested: { b: 2, a: 1 }, title: 'Chat' },
        },
      ],
    }
    expect(createBackupImportDiff(current, incoming)).toEqual([])
    expect(
      createBackupImportDiff(current, {
        ...incoming,
        conversations: incoming.conversations.map((chat) => ({
          ...chat,
          updatedAt: 2,
        })),
      }),
    ).toEqual([
      expect.objectContaining({
        section: 'aiChat',
        id: 'chat',
        kind: 'updated',
      }),
    ])
  })

  it('keeps conversation/message and saved-tab graphs together in a partial restore', () => {
    const current = createData()
    const incoming = {
      ...current,
      savedTabs: { ...current.savedTabs, urls: [url('new')] },
      conversations: [{ id: 'chat', updatedAt: 1, value: {} }],
      messages: [
        {
          id: 'msg',
          conversationId: 'chat',
          createdAt: 1,
          value: 'private content',
        },
      ],
    }
    const selected = selectBackupImportData(current, incoming, {
      ...ALL_BACKUP_IMPORT_SECTIONS,
      userSettings: false,
      savedTabs: false,
    })
    expect(selected.savedTabs).toEqual(current.savedTabs)
    expect(selected.userSettings).toEqual(current.userSettings)
    expect(selected.conversations).toEqual(incoming.conversations)
    expect(selected.messages).toEqual(incoming.messages)
    expect(
      createBackupImportDiff(current, incoming).some((change) =>
        JSON.stringify(change).includes('private content'),
      ),
    ).toBe(false)
  })
})
