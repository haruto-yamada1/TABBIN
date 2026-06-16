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

    it('categories 欠けは legacy データとして default で entity 化する (issue #530 review P1)', () => {
      const entity = ChromeSavedTabsStorageMapper.parseCustomProject({
        createdAt: 1,
        id: 'project-1',
        name: 'Q4',
        updatedAt: 1,
      })
      expect(entity).not.toBeNull()
      expect(entity?.categories).toStrictEqual([])
    })

    it('createdAt / updatedAt 欠けは legacy データとして default で entity 化する', () => {
      const entity = ChromeSavedTabsStorageMapper.parseCustomProject({
        categories: ['research'],
        id: 'project-1',
        name: 'Q4',
      })
      expect(entity).not.toBeNull()
      expect(entity?.createdAt).toBe(0)
      expect(entity?.updatedAt).toBe(0)
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

    it('toSavedTabRaw は original を渡すとリッチ補助フィールドを urlIds に揃えて持ち越す', () => {
      const entity = ChromeSavedTabsStorageMapper.parseTabGroup({
        domain: 'example.com',
        id: 'group-1',
        urlIds: ['url-keep'],
      })
      expect(entity).not.toBeNull()
      if (!entity) {
        return
      }
      const raw = ChromeSavedTabsStorageMapper.toSavedTabRaw(entity, {
        categoryKeywords: [{ categoryName: 'docs', keywords: ['doc', 'spec'] }],
        domain: 'example.com',
        id: 'group-1',
        subCategories: ['docs'],
        subCategoryOrder: ['docs'],
        subCategoryOrderWithUncategorized: ['docs', 'uncategorized'],
        urlIds: ['url-remove', 'url-keep'],
        urls: [
          {
            id: 'url-remove',
            title: 'Remove',
            url: 'https://example.com/remove',
          },
          {
            id: 'url-keep',
            title: 'Keep',
            url: 'https://example.com/keep',
          },
        ],
        urlSubCategories: {
          'url-keep': 'docs',
          'url-remove': 'news',
        },
      })
      expect(raw.urlIds).toStrictEqual(['url-keep'])
      expect(raw.urls).toStrictEqual([
        {
          id: 'url-keep',
          title: 'Keep',
          url: 'https://example.com/keep',
        },
      ])
      expect(raw.urlSubCategories).toStrictEqual({ 'url-keep': 'docs' })
      expect(raw.subCategories).toStrictEqual(['docs'])
      expect(raw.categoryKeywords).toStrictEqual([
        { categoryName: 'docs', keywords: ['doc', 'spec'] },
      ])
      expect(raw.subCategoryOrder).toStrictEqual(['docs'])
      expect(raw.subCategoryOrderWithUncategorized).toStrictEqual([
        'docs',
        'uncategorized',
      ])
    })

    it('toSavedTabRaw は urls が全て削除対象なら urls キー自体を省く', () => {
      const entity = ChromeSavedTabsStorageMapper.parseTabGroup({
        domain: 'example.com',
        id: 'group-1',
        urlIds: ['url-keep'],
      })
      expect(entity).not.toBeNull()
      if (!entity) {
        return
      }
      const raw = ChromeSavedTabsStorageMapper.toSavedTabRaw(entity, {
        domain: 'example.com',
        id: 'group-1',
        urlIds: ['url-remove'],
        urls: [
          {
            id: 'url-remove',
            title: 'Remove',
            url: 'https://example.com/remove',
          },
        ],
        urlSubCategories: { 'url-remove': 'news' },
      })
      expect(raw.urls).toBeUndefined()
      expect(raw.urlSubCategories).toBeUndefined()
    })

    it('toSavedTabRaw は id が無い url エントリも保持する（既存挙動互換）', () => {
      const entity = ChromeSavedTabsStorageMapper.parseTabGroup({
        domain: 'example.com',
        id: 'group-1',
        urlIds: ['url-keep'],
      })
      expect(entity).not.toBeNull()
      if (!entity) {
        return
      }
      const raw = ChromeSavedTabsStorageMapper.toSavedTabRaw(entity, {
        domain: 'example.com',
        id: 'group-1',
        urlIds: ['url-keep'],
        urls: [
          {
            title: 'Legacy without ID',
            url: 'https://legacy.example.com/a',
          },
          {
            id: 'url-keep',
            title: 'Keep',
            url: 'https://example.com/keep',
          },
        ],
      })
      expect(raw.urls).toStrictEqual([
        { title: 'Legacy without ID', url: 'https://legacy.example.com/a' },
        { id: 'url-keep', title: 'Keep', url: 'https://example.com/keep' },
      ])
    })

    it('toSavedTabRaw は original.domain が schemeful 形式ならそれを持ち越す（issue #501 review P1）', () => {
      // 既存 chrome.storage には `https://example.com` のようにスキーム付き
      // で書き込まれているケースがある。entity 化時に hostname 形式
      // （`example.com`）へ正規化されるが、書き戻し時にスキーム付きへ戻して
      // おかないと `getTabDomain()`（`src/lib/storage/migration.ts`）が
      // 生成する schemeful 形式と一致しなくなり重複グループが発生する。
      const entity = ChromeSavedTabsStorageMapper.parseTabGroup({
        domain: 'https://example.com',
        id: 'group-1',
        urlIds: ['url-1'],
      })
      expect(entity).not.toBeNull()
      if (!entity) {
        return
      }
      const raw = ChromeSavedTabsStorageMapper.toSavedTabRaw(entity, {
        domain: 'https://example.com',
        id: 'group-1',
        urlIds: ['url-1'],
      })
      expect(raw.domain).toBe('https://example.com')
    })

    it('toSavedTabRaw は original が無い場合 entity.domain をそのまま書き出す', () => {
      // original が無い新規エンティティは entity 側の正規化済み domain を
      // そのまま書き出す（既存挙動と互換）。
      const entity = ChromeSavedTabsStorageMapper.parseTabGroup({
        domain: 'example.com',
        id: 'group-1',
        urlIds: ['url-1'],
      })
      expect(entity).not.toBeNull()
      if (!entity) {
        return
      }
      const raw = ChromeSavedTabsStorageMapper.toSavedTabRaw(entity)
      expect(raw.domain).toBe('example.com')
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

    it('toParentCategoryRaw は original.domainNames が schemeful 形式ならそれを持ち越す（issue #501 review P1 同根）', () => {
      // `assignDomainToCategory` が tabGroup.domain（schemeful）を
      // category.domainNames に追加するため、既存 chrome.storage には
      // schemeful 形式で書き込まれているケースがある。entity 化時に
      // hostname 形式へ正規化されるが、書き戻し時に original 側の
      // schemeful 形式を持ち越す。
      const entity = ChromeSavedTabsStorageMapper.parseParentCategory({
        domainNames: ['https://example.com'],
        domains: ['group-1'],
        id: 'cat-1',
        name: 'Docs',
      })
      expect(entity).not.toBeNull()
      if (!entity) {
        return
      }
      const raw = ChromeSavedTabsStorageMapper.toParentCategoryRaw(entity, {
        domainNames: ['https://example.com'],
        domains: ['group-1'],
        id: 'cat-1',
        name: 'Docs',
      })
      expect(raw.domainNames).toStrictEqual(['https://example.com'])
    })

    it('toParentCategoryRaw は use-case が entity.domainNames に追加した新規エントリを保持する（PR #506 review P2 対応）', () => {
      // AddDomainToParentCategoryUseCase が hostname 正規化後の entity に
      // 新しい domain を追加した場合、original 側の `domainNames` には
      // そのエントリが含まれないため、entity 側の追加分が反映されないと
      // 保存されない。既存エントリは schemeful 形式を維持しつつ、新規は
      // entity 側の hostname 形式をそのまま採用する。
      const entity = ChromeSavedTabsStorageMapper.parseParentCategory({
        domainNames: ['example.com', 'newsite.com'],
        domains: ['group-1', 'group-2'],
        id: 'cat-1',
        name: 'Docs',
      })
      expect(entity).not.toBeNull()
      if (!entity) {
        return
      }
      const raw = ChromeSavedTabsStorageMapper.toParentCategoryRaw(entity, {
        domainNames: ['https://example.com'],
        domains: ['group-1'],
        id: 'cat-1',
        name: 'Docs',
      })
      expect(raw.domainNames).toStrictEqual([
        'https://example.com',
        'newsite.com',
      ])
    })

    it('toParentCategoryRaw は use-case が entity.domainNames から削除したエントリを original から落とす（PR #506 review P2 対応）', () => {
      // RemoveDomainFromParentCategoryUseCase で entity.domainNames から
      // 削除した場合、original に残っていても最終 raw には含めない。
      const entity = ChromeSavedTabsStorageMapper.parseParentCategory({
        domainNames: ['keep.com'],
        domains: ['group-keep'],
        id: 'cat-1',
        name: 'Docs',
      })
      expect(entity).not.toBeNull()
      if (!entity) {
        return
      }
      const raw = ChromeSavedTabsStorageMapper.toParentCategoryRaw(entity, {
        domainNames: ['https://keep.com', 'https://remove.com'],
        domains: ['group-keep', 'group-remove'],
        id: 'cat-1',
        name: 'Docs',
      })
      expect(raw.domainNames).toStrictEqual(['https://keep.com'])
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

    it('toCustomProjectRaw は original を渡すと projectKeywords / urlMetadata / categoryOrder / urls を持ち越す', () => {
      const entity = ChromeSavedTabsStorageMapper.parseCustomProject({
        categories: ['research'],
        createdAt: 1,
        id: 'project-1',
        name: 'Q4',
        updatedAt: 2,
        urlIds: ['url-keep'],
      })
      expect(entity).not.toBeNull()
      if (!entity) {
        return
      }
      const raw = ChromeSavedTabsStorageMapper.toCustomProjectRaw(entity, {
        categories: ['research'],
        categoryOrder: ['research', 'news'],
        createdAt: 1,
        id: 'project-1',
        name: 'Q4',
        projectKeywords: {
          domainKeywords: ['example.com'],
          titleKeywords: ['quarterly'],
          urlKeywords: ['report'],
        },
        updatedAt: 2,
        urlIds: ['url-remove', 'url-keep'],
        urlMetadata: {
          'url-keep': { category: 'research', notes: 'kept' },
          'url-remove': { category: 'news', notes: 'removed' },
        },
        urls: [
          {
            title: 'Existing URL',
            url: 'https://example.com/legacy',
          },
        ],
      })
      expect(raw.urlIds).toStrictEqual(['url-keep'])
      expect(raw.projectKeywords).toStrictEqual({
        domainKeywords: ['example.com'],
        titleKeywords: ['quarterly'],
        urlKeywords: ['report'],
      })
      expect(raw.urlMetadata).toStrictEqual({
        'url-keep': { category: 'research', notes: 'kept' },
      })
      expect(raw.categoryOrder).toStrictEqual(['research', 'news'])
      expect(raw.urls).toStrictEqual([
        { title: 'Existing URL', url: 'https://example.com/legacy' },
      ])
    })

    it('toCustomProjectRaw は urlIds が空なら urls キーを省く', () => {
      const entity = ChromeSavedTabsStorageMapper.parseCustomProject({
        categories: ['research'],
        createdAt: 1,
        id: 'project-1',
        name: 'Q4',
        updatedAt: 2,
      })
      expect(entity).not.toBeNull()
      if (!entity) {
        return
      }
      const raw = ChromeSavedTabsStorageMapper.toCustomProjectRaw(entity, {
        categories: ['research'],
        createdAt: 1,
        id: 'project-1',
        name: 'Q4',
        updatedAt: 2,
        urlIds: ['url-remove'],
        urls: [
          {
            title: 'Will be dropped',
            url: 'https://example.com/dropped',
          },
        ],
      })
      expect(raw.urls).toBeUndefined()
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
