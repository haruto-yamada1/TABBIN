/**
 * @file createMockTabGroupRepository.ts
 * @description テスト用に `TabGroupRepository` の最小モックを生成するヘルパー。
 *
 * 背景: repository interface は branded type（`TabGroupId` / `UrlRecordId` /
 * `ParentCategoryId` / `SavedAt` / `DomainName`）の `readonly` 配列を返すが、
 * テストでは素の `string` / `number` で組み立てたプレーンなオブジェクトを
 * 渡したくなる。各テストで `as unknown as ReturnType<...>` のキャストを
 * 散らすと lint 違反（unsafe-type-assertion）と重複コードが増えるため、
 * キャストをここに閉じ込めて共有する。
 *
 * 使い方:
 * ```ts
 * const repo = createMockTabGroupRepository({
 *   savedTabs: [{ id: 'g1', domain: 'example.com' }],
 * })
 * vi.mocked(repo.findAll).mockResolvedValueOnce([...])
 * ```
 *
 * 返り値は `TabGroupRepository` としてそのまま使える。各メソッドの振る舞いは
 * 必要に応じて呼び出し側で `vi.mocked(repo.xxx).mockResolvedValueOnce(...)` /
 * `.mockRejectedValueOnce(...)` で上書きする。
 */

import { vi } from 'vitest'

import { tabGroupDomainName } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { TabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'

import { createTabGroup } from './createCurrentCollectionFixtures'

export type MockTabGroupRepositoryState = {
  readonly savedTabs: readonly TabGroup[]
}

/**
 * `TabGroupRepository` の最小モックを生成する。`savedTabs` を保持する
 * `Map` ライクな state を受け取り、`findAll` / `findById` / `saveAll` /
 * `removeByIds` が state と連動して動く。
 *
 * branded ↔ plain 変換は内部の `as unknown as` に閉じ込めている。呼び出し
 * 側は branded type を一切意識せず plain object を扱える。
 */
export const createMockTabGroupRepository = (
  initial: MockTabGroupRepositoryState,
): TabGroupRepository => {
  const state: { savedTabs: readonly TabGroup[] } = {
    savedTabs: [...initial.savedTabs],
  }
  // branded 境界の吸収。テストデータの plain な `id: string` を
  // `TabGroupId` として流し込む。
  return {
    findAll: vi.fn(async () => state.savedTabs),

    findById: vi.fn(async (id) => {
      return state.savedTabs.find((tab) => tab.id === id) ?? null
    }),

    findRawDomainById: vi.fn(async (id) => {
      const tab = state.savedTabs.find((entry) => entry.id === id)
      return tab ? tabGroupDomainName(tab) : null
    }),

    findRawTabGroupById: vi.fn(async (id) => {
      return state.savedTabs.find((entry) => entry.id === id) ?? null
    }),

    saveAll: vi.fn(async (next) => {
      state.savedTabs = next
    }),

    removeByIds: vi.fn(async (ids) => {
      const idSet = new Set<string>(ids)
      state.savedTabs = state.savedTabs.filter((tab) => !idSet.has(tab.id))
    }),
  }
}

/**
 * テストデータのプレーンな `TabGroup` 風オブジェクトを、repository モック
 * に渡せる `TabGroup` 配列へ変換する。`urlIds` / `parentCategoryId` 等の
 * branded type フィールドも `as unknown as` で橋渡しする。
 */
export const toMockTabGroup = (input: {
  id: string
  domain: string
  parentCategoryId?: string
  urlIds?: readonly string[]
  savedAt?: number
  subCategories?: readonly string[]
  categoryKeywords?: readonly {
    categoryName: string
    keywords: readonly string[]
  }[]
  subCategoryOrder?: readonly string[]
  subCategoryOrderWithUncategorized?: readonly string[]
  urls?: readonly {
    id?: string
    url: string
    title: string
    subCategory?: string
    savedAt?: number
  }[]
}): TabGroup => {
  const memberships = input.urls
    ? input.urls.flatMap(({ id, subCategory }) =>
        id
          ? [
              {
                ...(subCategory ? { category: subCategory } : {}),
                urlId: id,
              },
            ]
          : [],
      )
    : (input.urlIds ?? []).map((urlId) => ({ urlId }))
  return createTabGroup({
    categoryKeywords: input.categoryKeywords,
    domain: input.domain,
    id: input.id,
    memberships,
    parentCategoryId: input.parentCategoryId,
    savedAt: input.savedAt,
    subCategories: input.subCategories,
    subCategoryOrder: input.subCategoryOrder,
    subCategoryOrderWithUncategorized: input.subCategoryOrderWithUncategorized,
  })
}
