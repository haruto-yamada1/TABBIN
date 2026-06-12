import { describe, expect, it } from 'vitest'

import { createTabGroup } from '../entities/TabGroup'
import { createUrlRecord } from '../entities/UrlRecord'
import { createUrlRecordId } from '../value-objects/UrlRecordId'
import {
  decideUrlRecordIdsToRemoveAfterOpen,
  lookupUrlRecordIdsByUrl,
  removeUrlRecordIdsFromTabGroups,
} from './OpenedUrlRemovalPolicy'

const buildUrlRecord = (id: string, url: string) =>
  createUrlRecord({
    id,
    url,
    title: id,
    savedAt: 1_700_000_000_000,
  })

describe('OpenedUrlRemovalPolicy.decideUrlRecordIdsToRemoveAfterOpen', () => {
  it('removeTabAfterOpen が true なら click 経路の URL を削除対象にする', () => {
    const result = decideUrlRecordIdsToRemoveAfterOpen({
      openedUrls: [
        { urlRecordId: createUrlRecordId('url-1'), origin: 'click' },
        { urlRecordId: createUrlRecordId('url-2'), origin: 'click' },
      ],
      settings: {
        removeTabAfterOpen: true,
        removeTabAfterExternalDrop: false,
      },
    })
    expect([...result]).toStrictEqual([
      createUrlRecordId('url-1'),
      createUrlRecordId('url-2'),
    ])
  })

  it('removeTabAfterOpen が false なら click 経路は削除しない', () => {
    const result = decideUrlRecordIdsToRemoveAfterOpen({
      openedUrls: [
        { urlRecordId: createUrlRecordId('url-1'), origin: 'click' },
      ],
      settings: {
        removeTabAfterOpen: false,
        removeTabAfterExternalDrop: true,
      },
    })
    expect(result.size).toBe(0)
  })

  it('externalDrop は removeTabAfterExternalDrop で判定する', () => {
    const result = decideUrlRecordIdsToRemoveAfterOpen({
      openedUrls: [
        { urlRecordId: createUrlRecordId('url-1'), origin: 'externalDrop' },
      ],
      settings: {
        removeTabAfterOpen: false,
        removeTabAfterExternalDrop: true,
      },
    })
    expect(result.has(createUrlRecordId('url-1'))).toBe(true)
  })
})

describe('OpenedUrlRemovalPolicy.lookupUrlRecordIdsByUrl', () => {
  it('URL 文字列に対応する UrlRecordId を抽出する', () => {
    const records = [
      buildUrlRecord('url-1', 'https://example.com/a'),
      buildUrlRecord('url-2', 'https://example.com/b'),
      buildUrlRecord('url-3', 'https://example.com/c'),
    ]
    const result = lookupUrlRecordIdsByUrl({
      urlRecords: records,
      urls: ['https://example.com/a', 'https://example.com/c'],
    })
    expect([...result]).toStrictEqual([
      createUrlRecordId('url-1'),
      createUrlRecordId('url-3'),
    ])
  })

  it('該当しない URL は無視する', () => {
    const result = lookupUrlRecordIdsByUrl({
      urlRecords: [buildUrlRecord('url-1', 'https://example.com/a')],
      urls: ['https://other.example.com'],
    })
    expect(result.size).toBe(0)
  })
})

describe('OpenedUrlRemovalPolicy.removeUrlRecordIdsFromTabGroups', () => {
  it('削除対象 ID を取り除いた TabGroup を返す', () => {
    const group = createTabGroup({
      id: 'group-1',
      domain: 'example.com',
      urlIds: ['url-1', 'url-2', 'url-3'],
    })
    const result = removeUrlRecordIdsFromTabGroups({
      tabGroups: [group],
      urlRecordIdsToRemove: new Set([createUrlRecordId('url-2')]),
    })
    expect(result).toHaveLength(1)
    expect(result[0]?.urlIds).toStrictEqual(['url-1', 'url-3'])
  })

  it('すべての URL が削除されたら TabGroup ごと除外する', () => {
    const group = createTabGroup({
      id: 'group-1',
      domain: 'example.com',
      urlIds: ['url-1'],
    })
    const result = removeUrlRecordIdsFromTabGroups({
      tabGroups: [group],
      urlRecordIdsToRemove: new Set([createUrlRecordId('url-1')]),
    })
    expect(result).toHaveLength(0)
  })

  it('削除対象が空集合の場合は元の配列をそのまま複製して返す', () => {
    const group = createTabGroup({
      id: 'group-1',
      domain: 'example.com',
      urlIds: ['url-1'],
    })
    const result = removeUrlRecordIdsFromTabGroups({
      tabGroups: [group],
      urlRecordIdsToRemove: new Set(),
    })
    expect(result).toStrictEqual([group])
  })

  it('URL 削除後の件数が正しく更新される', () => {
    const group = createTabGroup({
      id: 'group-1',
      domain: 'example.com',
      urlIds: ['url-1', 'url-2', 'url-3', 'url-4'],
    })
    const result = removeUrlRecordIdsFromTabGroups({
      tabGroups: [group],
      urlRecordIdsToRemove: new Set([
        createUrlRecordId('url-2'),
        createUrlRecordId('url-4'),
      ]),
    })
    expect(result[0]?.urlIds).toHaveLength(2)
    expect(result[0]?.urlIds).toStrictEqual(['url-1', 'url-3'])
  })
})
