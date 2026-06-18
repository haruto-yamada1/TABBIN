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

/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-type-assertion, typescript/no-unsafe-assignment, typescript/no-unsafe-type-assertion -- branded ↔ plain 変換キャストの集約点 */

import { vi } from 'vitest'

import type { TabGroup } from '../domain/entities/TabGroup'
import type { TabGroupRepository } from '../domain/repositories/TabGroupRepository'
import type { TabGroupId } from '../domain/value-objects/TabGroupId'

export interface MockTabGroupRepositoryState {
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
      const idString = id as unknown as string
      return state.savedTabs.find((tab) => tab.id === idString) ?? null
    }),

    findRawDomainById: vi.fn(async (id) => {
      const idString = id as unknown as string
      const tab = state.savedTabs.find((entry) => entry.id === idString)
      return (tab?.domain as unknown as string | undefined) ?? null
    }),

    findRawTabGroupById: vi.fn(async (id) => {
      const idString = id as unknown as string
      const tab = state.savedTabs.find((entry) => entry.id === idString)
      if (!tab) {
        return null
      }
      // entity 化された `TabGroup` には `subCategories` /
      // `categoryKeywords` がないが、mock helper は
      // `toMockTabGroup` 経由で `as unknown as TabGroup` に
      // キャストした拡張フィールドを持つ object を保持する。
      const extra = tab as unknown as {
        readonly categoryKeywords?: readonly {
          readonly categoryName: string
          readonly keywords: readonly string[]
        }[]
        readonly subCategories?: readonly string[]
      }
      return {
        categoryKeywords: (extra.categoryKeywords ?? []).map((keyword) => ({
          categoryName: keyword.categoryName,
          keywords: [...keyword.keywords],
        })),
        domain: tab.domain as unknown as string,
        id: tab.id as unknown as string,
        parentCategoryId: tab.parentCategoryId as unknown as string | undefined,
        subCategories: [...(extra.subCategories ?? [])],
      }
    }),

    saveAll: vi.fn(async (next) => {
      state.savedTabs = next
    }),

    removeByIds: vi.fn(async (ids) => {
      const idSet = new Set<string>(ids as unknown as readonly string[])
      state.savedTabs = state.savedTabs.filter(
        (tab) => !idSet.has(tab.id as unknown as string),
      )
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
}): TabGroup =>
  ({
    categoryKeywords: input.categoryKeywords
      ? input.categoryKeywords.map((ck) => ({
          categoryName: ck.categoryName,
          keywords: [...ck.keywords],
        }))
      : undefined,
    domain: input.domain,
    id: input.id as unknown as TabGroupId,
    parentCategoryId: input.parentCategoryId as unknown as
      | TabGroupId
      | undefined,
    savedAt: input.savedAt,
    subCategories: input.subCategories ? [...input.subCategories] : undefined,
    subCategoryOrder: input.subCategoryOrder
      ? [...input.subCategoryOrder]
      : undefined,
    subCategoryOrderWithUncategorized: input.subCategoryOrderWithUncategorized
      ? [...input.subCategoryOrderWithUncategorized]
      : undefined,
    urlIds: input.urlIds ? [...input.urlIds] : undefined,
    urls: input.urls ? input.urls.map((u) => ({ ...u })) : undefined,
  }) as unknown as TabGroup
