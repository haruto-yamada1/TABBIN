import { describe, expect, it } from 'vitest'

import { createCustomProjectId } from '../../domain/value-objects/CustomProjectId'
import { createDomainName } from '../../domain/value-objects/DomainName'
import { createParentCategoryId } from '../../domain/value-objects/ParentCategoryId'
import { createTabGroupId } from '../../domain/value-objects/TabGroupId'
import { createUrlRecordId } from '../../domain/value-objects/UrlRecordId'
import { ChromeSavedTabsStorageMapper } from './ChromeSavedTabsStorageMapper'

describe('ChromeSavedTabsStorageMapper', () => {
  describe('parseTabGroup', () => {
    it('必須フィールドを持つ生データを entity 化する', () => {
      const entity = ChromeSavedTabsStorageMapper.parseTabGroup({
        domain: 'example.com',
        id: 'group-1',
      })
      expect(entity).not.toBeNull()
      expect(entity?.id).toBe('group-1')
      expect(entity?.domain).toBe('example.com')
      expect(entity?.urlIds).toStrictEqual([])
    })

    it('rich な補助フィールドは読み捨てるが urlIds は保持する', () => {
      const entity = ChromeSavedTabsStorageMapper.parseTabGroup({
        domain: 'https://example.com',
        id: 'group-1',
        parentCategoryId: 'cat-1',
        savedAt: 1_700_000_000_000,
        urlIds: ['url-1', 'url-2'],
        urlSubCategories: { 'url-1': 'docs' },
      })
      expect(entity).not.toBeNull()
      expect(entity?.urlIds).toStrictEqual(['url-1', 'url-2'])
      expect(entity?.parentCategoryId).toBe('cat-1')
      expect(entity?.savedAt).toBe(1_700_000_000_000)
    })

    it('id / domain が無い生データは null を返す', () => {
      expect(
        ChromeSavedTabsStorageMapper.parseTabGroup({ urlIds: ['url-1'] }),
      ).toBeNull()
      expect(ChromeSavedTabsStorageMapper.parseTabGroup(null)).toBeNull()
      expect(
        ChromeSavedTabsStorageMapper.parseTabGroup('not-an-object'),
      ).toBeNull()
    })

    it('urlIds に空文字が混じると null を返す', () => {
      expect(
        ChromeSavedTabsStorageMapper.parseTabGroup({
          domain: 'example.com',
          id: 'group-1',
          urlIds: ['', 'url-2'],
        }),
      ).toBeNull()
    })
  })

  describe('parseUrlRecord', () => {
    it('必須フィールドを持つ生データを entity 化する', () => {
      const entity = ChromeSavedTabsStorageMapper.parseUrlRecord({
        id: 'url-1',
        savedAt: 1,
        title: 'A',
        url: 'https://example.com',
      })
      expect(entity).not.toBeNull()
      expect(entity?.id).toBe('url-1')
      expect(entity?.url).toBe('https://example.com')
      expect(entity?.title).toBe('A')
      expect(entity?.savedAt).toBe(1)
    })

    it('favIconUrl 省略時は undefined として保持', () => {
      const entity = ChromeSavedTabsStorageMapper.parseUrlRecord({
        id: 'url-1',
        savedAt: 1,
        title: 'A',
        url: 'https://example.com',
      })
      expect(entity?.favIconUrl).toBeUndefined()
    })

    it('URL 形式が不正なら null を返す', () => {
      expect(
        ChromeSavedTabsStorageMapper.parseUrlRecord({
          id: 'url-1',
          savedAt: 1,
          title: 'A',
          url: 'not a url',
        }),
      ).toBeNull()
    })

    it('必須欠けは null を返す', () => {
      expect(
        ChromeSavedTabsStorageMapper.parseUrlRecord({
          id: 'url-1',
          title: 'A',
          url: 'https://example.com',
        }),
      ).toBeNull()
    })
  })

  describe('parseParentCategory', () => {
    it('必須フィールドを持つ生データを entity 化する', () => {
      const entity = ChromeSavedTabsStorageMapper.parseParentCategory({
        domainNames: ['example.com'],
        domains: ['group-1'],
        id: 'cat-1',
        name: 'Docs',
      })
      expect(entity).not.toBeNull()
      expect(entity?.id).toBe('cat-1')
      expect(entity?.name).toBe('Docs')
      expect(entity?.domains).toStrictEqual(['group-1'])
      expect(entity?.domainNames).toStrictEqual(['example.com'])
    })

    it('空配列を許容する', () => {
      const entity = ChromeSavedTabsStorageMapper.parseParentCategory({
        domainNames: [],
        domains: [],
        id: 'cat-1',
        name: 'Docs',
      })
      expect(entity).not.toBeNull()
    })

    it('必須欠けは null を返す', () => {
      expect(
        ChromeSavedTabsStorageMapper.parseParentCategory({
          domainNames: ['example.com'],
          id: 'cat-1',
          name: 'Docs',
        }),
      ).toBeNull()
    })
  })

  describe('parseCustomProject', () => {
    it('必須フィールドを持つ生データを entity 化する', () => {
      const entity = ChromeSavedTabsStorageMapper.parseCustomProject({
        categories: ['research'],
        createdAt: 1,
        id: 'project-1',
        name: 'Q4',
        updatedAt: 2,
      })
      expect(entity).not.toBeNull()
      expect(entity?.id).toBe('project-1')
      expect(entity?.name).toBe('Q4')
      expect(entity?.categories).toStrictEqual(['research'])
      expect(entity?.createdAt).toBe(1)
      expect(entity?.updatedAt).toBe(2)
    })

    it('urlIds を持つ project を entity 化する', () => {
      const entity = ChromeSavedTabsStorageMapper.parseCustomProject({
        categories: [],
        createdAt: 1,
        id: 'project-1',
        name: 'Q4',
        updatedAt: 1,
        urlIds: ['url-1', 'url-2'],
      })
      expect(entity).not.toBeNull()
      expect(entity?.urlIds).toStrictEqual(['url-1', 'url-2'])
    })

    it('必須欠けは null を返す', () => {
      expect(
        ChromeSavedTabsStorageMapper.parseCustomProject({
          createdAt: 1,
          id: 'project-1',
          name: 'Q4',
          updatedAt: 1,
        }),
      ).toBeNull()
    })
  })

  describe('parseTabGroups / parseUrlRecords (配列パース)', () => {
    it('不正要素をスキップして有効要素だけを返す', () => {
      const result = ChromeSavedTabsStorageMapper.parseTabGroups([
        { domain: 'example.com', id: 'group-1' },
        { domain: 'https://broken' },
        null,
        { domain: 'example.com', id: 'group-2', urlIds: ['url-1'] },
      ])
      expect(result).toHaveLength(2)
      expect(result[0]?.id).toBe('group-1')
      expect(result[1]?.id).toBe('group-2')
    })

    it('配列でない入力は空配列を返す', () => {
      expect(ChromeSavedTabsStorageMapper.parseTabGroups(null)).toStrictEqual(
        [],
      )
      expect(
        ChromeSavedTabsStorageMapper.parseTabGroups('not-array'),
      ).toStrictEqual([])
    })

    it('parseUrlRecords も同様にスキップする', () => {
      const result = ChromeSavedTabsStorageMapper.parseUrlRecords([
        { id: 'url-1', savedAt: 1, title: 'A', url: 'https://example.com' },
        { id: 'url-2', title: 'B', url: 'https://example.com' },
        { id: 'url-3', savedAt: 2, title: 'C', url: 'https://example.com' },
      ])
      expect(result).toHaveLength(2)
      expect(result[0]?.id).toBe('url-1')
      expect(result[1]?.id).toBe('url-3')
    })
  })

  describe('collectParseSkipped', () => {
    it('スキップ件数と抽出 entity を同時に返す', () => {
      const result = ChromeSavedTabsStorageMapper.collectParseSkipped(
        [
          { domain: 'example.com', id: 'group-1' },
          null,
          { domain: 'https://broken' },
          { domain: 'example.com', id: 'group-2' },
        ],
        (item) => ChromeSavedTabsStorageMapper.parseTabGroup(item),
      )
      expect(result.entities).toHaveLength(2)
      expect(result.skippedCount).toBe(2)
    })

    it('配列でない入力は entities=[], skippedCount=0', () => {
      const result = ChromeSavedTabsStorageMapper.collectParseSkipped(
        null,
        (item) => ChromeSavedTabsStorageMapper.parseTabGroup(item),
      )
      expect(result.entities).toStrictEqual([])
      expect(result.skippedCount).toBe(0)
    })
  })

  describe('toUrlRecordRaw / toSavedTabRaw / toParentCategoryRaw / toCustomProjectRaw', () => {
    it('toUrlRecordRaw は entity を最小 raw 形式へ戻す', () => {
      const entity = ChromeSavedTabsStorageMapper.parseUrlRecord({
        favIconUrl: 'https://example.com/icon.png',
        id: 'url-1',
        savedAt: 1,
        title: 'A',
        url: 'https://example.com',
      })
      expect(entity).not.toBeNull()
      if (!entity) {
        return
      }
      const raw = ChromeSavedTabsStorageMapper.toUrlRecordRaw(entity)
      expect(raw).toStrictEqual({
        favIconUrl: 'https://example.com/icon.png',
        id: 'url-1',
        savedAt: 1,
        title: 'A',
        url: 'https://example.com',
      })
    })

    it('toSavedTabRaw は urlIds 配列をコピーして保持する', () => {
      const entity = ChromeSavedTabsStorageMapper.parseTabGroup({
        domain: 'example.com',
        id: 'group-1',
        urlIds: ['url-1', 'url-2'],
      })
      expect(entity).not.toBeNull()
      if (!entity) {
        return
      }
      const raw = ChromeSavedTabsStorageMapper.toSavedTabRaw(entity)
      expect(raw.id).toBe('group-1')
      expect(raw.urlIds).toStrictEqual(['url-1', 'url-2'])
    })

    it('toParentCategoryRaw は domains / domainNames をコピーして保持する', () => {
      const entity = ChromeSavedTabsStorageMapper.parseParentCategory({
        domainNames: ['example.com'],
        domains: ['group-1'],
        id: 'cat-1',
        name: 'Docs',
      })
      expect(entity).not.toBeNull()
      if (!entity) {
        return
      }
      const raw = ChromeSavedTabsStorageMapper.toParentCategoryRaw(entity)
      expect(raw.domains).toStrictEqual(['group-1'])
      expect(raw.domainNames).toStrictEqual(['example.com'])
    })

    it('toCustomProjectRaw は categories / urlIds をコピーして保持する', () => {
      const entity = ChromeSavedTabsStorageMapper.parseCustomProject({
        categories: ['research'],
        createdAt: 1,
        id: 'project-1',
        name: 'Q4',
        updatedAt: 2,
        urlIds: ['url-1'],
      })
      expect(entity).not.toBeNull()
      if (!entity) {
        return
      }
      const raw = ChromeSavedTabsStorageMapper.toCustomProjectRaw(entity)
      expect(raw.categories).toStrictEqual(['research'])
      expect(raw.urlIds).toStrictEqual(['url-1'])
      expect(raw.createdAt).toBe(1)
      expect(raw.updatedAt).toBe(2)
    })
  })

  describe('id toString helpers', () => {
    it('各 ID は素の string に変換できる', () => {
      expect(
        ChromeSavedTabsStorageMapper.urlRecordIdToString(
          createUrlRecordId('url-1'),
        ),
      ).toBe('url-1')
      expect(
        ChromeSavedTabsStorageMapper.tabGroupIdToString(
          createTabGroupId('group-1'),
        ),
      ).toBe('group-1')
      expect(
        ChromeSavedTabsStorageMapper.parentCategoryIdToString(
          createParentCategoryId('cat-1'),
        ),
      ).toBe('cat-1')
      expect(
        ChromeSavedTabsStorageMapper.customProjectIdToString(
          createCustomProjectId('project-1'),
        ),
      ).toBe('project-1')
      expect(
        ChromeSavedTabsStorageMapper.domainNameToString(
          createDomainName('example.com'),
        ),
      ).toBe('example.com')
    })
  })
})
