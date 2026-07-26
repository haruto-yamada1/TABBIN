import { describe, expect, expectTypeOf, it, vi } from 'vitest'

import {
  MIGRATION_SOURCE_KEYS,
  MigrationSourceReadError,
} from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'
import type { MigrationSourceKey } from '@/contexts/saved-tabs/application/ports/RawLegacyStorageReaderPort'

import { ChromeRawLegacyStorageReader } from './ChromeRawLegacyStorageReader'
import type { RawLegacyStorageArea } from './ChromeRawLegacyStorageReader'

const createStorage = (result: unknown): RawLegacyStorageArea => ({
  get: vi.fn(
    async (_keys: readonly MigrationSourceKey[]): Promise<unknown> => result,
  ),
})

describe('ChromeRawLegacyStorageReader', () => {
  it('migration source keys を 1 回だけ読み raw 値を変換せず保持する', async () => {
    const storedValues = {
      activeAiChatConversationId: undefined,
      aiChatConversations: [{ invalid: 'raw conversation' }],
      customProjectOrder: { invalid: true },
      customProjects: null,
      domainCategoryMappings: '',
      domainCategorySettings: 0,
      parentCategories: false,
      savedAnalyticsViews: [1],
      savedTabs: [],
      urls: 'invalid raw urls',
    }
    const storage = createStorage(storedValues)
    const reader = new ChromeRawLegacyStorageReader(storage)

    await expect(reader.readSnapshot()).resolves.toStrictEqual(
      Object.fromEntries(
        MIGRATION_SOURCE_KEYS.map((key) => [
          key,
          { status: 'present', value: storedValues[key] },
        ]),
      ),
    )
    expect(storage.get).toHaveBeenCalledTimes(1)
    expect(storage.get).toHaveBeenCalledWith(MIGRATION_SOURCE_KEYS)
  })

  it('own property omission と present-empty を区別する', async () => {
    const storage = createStorage({ savedTabs: undefined, urls: [] })
    const reader = new ChromeRawLegacyStorageReader(storage)

    const snapshot = await reader.readSnapshot()

    expect(snapshot.urls).toStrictEqual({ status: 'present', value: [] })
    expect(snapshot.savedTabs).toStrictEqual({
      status: 'present',
      value: undefined,
    })
    expect(snapshot.customProjects).toStrictEqual({ status: 'missing' })
  })

  it('storage rejection を typed read error に変換する', async () => {
    const cause = new Error('storage rejected')
    const storage: RawLegacyStorageArea = {
      get: vi.fn(async () => {
        throw cause
      }),
    }
    const reader = new ChromeRawLegacyStorageReader(storage)

    await expect(reader.readSnapshot()).rejects.toMatchObject({
      cause,
      code: 'MIGRATION_SOURCE_READ_FAILED',
      name: 'MigrationSourceReadError',
    })
    await expect(reader.readSnapshot()).rejects.toBeInstanceOf(
      MigrationSourceReadError,
    )
  })

  it.each([
    { label: 'null', result: null },
    { label: 'array', result: [] },
    { label: 'primitive', result: 'not an object' },
  ])('$label response を partial read とする', async ({ result }) => {
    const reader = new ChromeRawLegacyStorageReader(createStorage(result))

    await expect(reader.readSnapshot()).rejects.toMatchObject({
      code: 'MIGRATION_SOURCE_PARTIAL_READ',
      name: 'MigrationSourceReadError',
    })
  })

  it('storage dependency は get capability だけを要求する', async () => {
    expectTypeOf<keyof RawLegacyStorageArea>().toEqualTypeOf<'get'>()

    const set = vi.fn()
    const remove = vi.fn()
    const storage = {
      ...createStorage({}),
      remove,
      set,
    }
    const reader = new ChromeRawLegacyStorageReader(storage)

    await reader.readSnapshot()

    expect(set).not.toHaveBeenCalled()
    expect(remove).not.toHaveBeenCalled()
  })
})
