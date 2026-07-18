import { describe, expect, it } from 'vitest'

import {
  PersistenceRecordDecodeError,
  decodePersistenceRecords,
  isPersistenceJsonRecord,
  isPersistenceMessageRecord,
  isPersistenceV2Category,
  isPersistenceV2Collection,
  isPersistenceV2Group,
  isPersistenceV2Membership,
  isPersistenceV2Url,
} from './PersistenceRecordDecoders'

const timestamps = { createdAt: 1, updatedAt: 1 }

describe('PersistenceRecordDecoders', () => {
  it('全store recordのruntime shapeを検証する', () => {
    expect(
      isPersistenceV2Url({
        favIconUrl: 'https://example.com/favicon.ico',
        firstSavedAt: 1,
        id: 'url-1',
        lastSavedAt: 1,
        normalizedUrl: 'https://example.com/',
        title: 'Example',
        updatedAt: 1,
        url: 'https://example.com/',
      }),
    ).toBe(true)
    expect(
      isPersistenceV2Collection({
        ...timestamps,
        definition: {
          projectKeywords: {
            domainKeywords: ['example'],
            titleKeywords: [],
            urlKeywords: [],
          },
          type: 'custom',
        },
        groupId: 'group-1',
        id: 'collection-1',
        name: 'Collection',
        sortOrder: 1024,
      }),
    ).toBe(true)
    expect(
      isPersistenceV2Membership({
        addedAt: 1,
        categoryId: 'category-1',
        collectionId: 'collection-1',
        notes: 'note',
        sortOrder: 1024,
        updatedAt: 1,
        urlId: 'url-1',
      }),
    ).toBe(true)
    expect(
      isPersistenceV2Category({
        ...timestamps,
        collectionId: 'collection-1',
        id: 'category-1',
        keywords: ['docs'],
        name: 'Docs',
        sortOrder: 1024,
      }),
    ).toBe(true)
    expect(
      isPersistenceV2Group({
        ...timestamps,
        id: 'group-1',
        name: 'Group',
        sortOrder: 1024,
      }),
    ).toBe(true)
    expect(
      isPersistenceJsonRecord({ id: 'view-1', updatedAt: 1, value: null }),
    ).toBe(true)
    expect(
      isPersistenceMessageRecord({
        conversationId: 'conversation-1',
        createdAt: 1,
        id: 'message-1',
        value: { text: 'Hello' },
      }),
    ).toBe(true)
  })

  it('invalid recordとnon-array resultをstore名付きerrorにする', () => {
    expect(isPersistenceV2Url(null)).toBe(false)
    expect(
      isPersistenceV2Collection({
        ...timestamps,
        definition: { type: 'unsupported' },
        id: 'collection-1',
        name: 'Collection',
        sortOrder: 1024,
      }),
    ).toBe(false)
    expect(
      isPersistenceV2Collection({
        ...timestamps,
        definition: null,
        id: 'collection-1',
        name: 'Collection',
        sortOrder: 1024,
      }),
    ).toBe(false)
    expect(isPersistenceV2Membership({})).toBe(false)
    expect(isPersistenceV2Category({ keywords: [1] })).toBe(false)
    expect(isPersistenceV2Group([])).toBe(false)
    expect(isPersistenceJsonRecord({ value: new Date() })).toBe(false)
    expect(
      isPersistenceJsonRecord({
        extra: new Date(),
        id: 'view-1',
        updatedAt: Number.NaN,
        value: {},
      }),
    ).toBe(false)
    expect(isPersistenceMessageRecord({ value: undefined })).toBe(false)
    expect(
      isPersistenceV2Url({
        extra: new Date(),
        firstSavedAt: 1,
        id: 'url-1',
        lastSavedAt: 1,
        normalizedUrl: 'https://example.com/',
        title: 'Example',
        updatedAt: 1,
        url: 'https://example.com/',
      }),
    ).toBe(false)
    expect(() =>
      decodePersistenceRecords({}, isPersistenceV2Url, 'urls'),
    ).toThrow(PersistenceRecordDecodeError)
    expect(() =>
      decodePersistenceRecords([null], isPersistenceV2Url, 'urls'),
    ).toThrow('IndexedDB urls contains an invalid persistence record')
  })
})
