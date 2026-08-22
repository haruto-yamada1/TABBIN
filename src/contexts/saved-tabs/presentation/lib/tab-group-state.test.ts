import { describe, expect, it } from 'vitest' // eslint-disable-line

import { buildPresentationCategoryLookup } from '@/contexts/saved-tabs/application/services/SavedTabsCategorizationService'
import type { SavedTabsParentCategoryDto as ParentCategoryDto } from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

import {
  buildUpdatedGroupAfterUrlIdRemoval,
  buildUrlIdsToRemove,
  countTabGroupUrls,
  createFilterGroupsByExcludedIdsUpdater,
  filterGroupsByExcludedIds,
  removeUrlIdsFromSavedTabs,
  syncGroupCategoryAssignment,
  updateSavedTabParentCategory,
} from './tab-group-state'

describe('tab-group-state.countTabGroupUrls', () => {
  it('urlIds を持つ modern 形式は urlIds.length を返す', () => {
    expect(
      countTabGroupUrls({
        domain: 'a.example.com',
        id: 'g1',
        memberships: ['url-1', 'url-2'].map((urlId) => ({ urlId })),
      }),
    ).toBe(2)
  })

  it('urlIds を持たない legacy 形式は urls.length を返す', () => {
    expect(
      countTabGroupUrls({
        domain: 'a.example.com',
        id: 'g1',
        urls: [{ title: 't', url: 'https://a.example.com' }],
      }),
    ).toBe(1)
  })

  it('両方無いときは 0', () => {
    expect(countTabGroupUrls({ domain: 'a.example.com', id: 'g1' })).toBe(0)
  })
})

describe('tab-group-state.filterGroupsByExcludedIds', () => {
  it('idsToExclude に含まれないグループを残す', () => {
    expect(
      filterGroupsByExcludedIds(
        [
          {
            domain: 'a.example.com',
            id: 'g1',
            memberships: [].map((urlId) => ({ urlId })),
          },
          {
            domain: 'b.example.com',
            id: 'g2',
            memberships: [].map((urlId) => ({ urlId })),
          },
        ],
        new Set(['g1']),
      ).map((group) => group.id),
    ).toStrictEqual(['g2'])
  })
})

describe('tab-group-state.createFilterGroupsByExcludedIdsUpdater', () => {
  it('updater を返して filterGroupsByExcludedIds と同じ結果になる', () => {
    const updater = createFilterGroupsByExcludedIdsUpdater(new Set(['g1']))
    expect(
      updater([
        {
          domain: 'a.example.com',
          id: 'g1',
          memberships: [].map((urlId) => ({ urlId })),
        },
        {
          domain: 'b.example.com',
          id: 'g2',
          memberships: [].map((urlId) => ({ urlId })),
        },
      ]).map((group) => group.id),
    ).toStrictEqual(['g2'])
  })
})

describe('tab-group-state.buildUrlIdsToRemove', () => {
  it('重複 URL は 1 件にまとめて id 集合を返す', () => {
    expect(
      buildUrlIdsToRemove(
        ['https://example.com/a', 'https://example.com/a'],
        [
          { id: 'url-a', url: 'https://example.com/a' },
          { id: 'url-b', url: 'https://example.com/b' },
        ],
      ),
    ).toStrictEqual(new Set(['url-a']))
  })

  it('urlsToRemove に存在しない URL は id 集合に含めない', () => {
    expect(
      buildUrlIdsToRemove([], [{ id: 'url-a', url: 'https://example.com/a' }]),
    ).toStrictEqual(new Set())
  })
})

describe('tab-group-state.removeUrlIdsFromSavedTabs', () => {
  it('指定 id を取り除き、空グループは結果から除く', () => {
    const result = removeUrlIdsFromSavedTabs(
      [
        {
          domain: 'a.example.com',
          id: 'g1',
          memberships: ['u1', 'u2'].map((urlId) => ({ urlId })),
        },
        {
          domain: 'b.example.com',
          id: 'g2',
          memberships: ['u2'].map((urlId) => ({ urlId })),
        },
      ],
      new Set(['u2']),
    )
    expect(result.hasChanges).toBe(true)
    expect(result.updatedSavedTabs.map((group) => group.id)).toStrictEqual([
      'g1',
    ])
  })

  it('変更がない場合は hasChanges=false', () => {
    const result = removeUrlIdsFromSavedTabs(
      [
        {
          domain: 'a.example.com',
          id: 'g1',
          memberships: ['u1'].map((urlId) => ({ urlId })),
        },
      ],
      new Set(['u2']),
    )
    expect(result.hasChanges).toBe(false)
  })

  it('urlIds を持たないグループはそのまま維持する', () => {
    const result = removeUrlIdsFromSavedTabs(
      [
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        { domain: 'a.example.com', id: 'g1' } as never,
      ],
      new Set(['u1']),
    )
    expect(result.hasChanges).toBe(false)
  })
})

describe('tab-group-state.buildUpdatedGroupAfterUrlIdRemoval', () => {
  it('urlSubCategories が空になったら undefined に戻す', () => {
    expect(
      buildUpdatedGroupAfterUrlIdRemoval(
        {
          domain: 'example.com',
          id: 'g1',
          memberships: [{ category: 'news', urlId: 'u1' }],
        },
        [],
      ),
    ).toStrictEqual({
      domain: 'example.com',
      id: 'g1',
      memberships: [],
    })
  })

  it('残った urlSubCategories は維持する', () => {
    expect(
      buildUpdatedGroupAfterUrlIdRemoval(
        {
          domain: 'example.com',
          id: 'g1',
          memberships: [
            { category: 'news', urlId: 'u1' },
            { category: 'docs', urlId: 'u2' },
          ],
        },
        [{ category: 'docs', urlId: 'u2' }],
      ),
    ).toStrictEqual({
      domain: 'example.com',
      id: 'g1',
      memberships: ['u2'].map((urlId) => ({
        urlId,
        ...({ u2: 'docs' }?.[urlId] ? { category: { u2: 'docs' }[urlId] } : {}),
      })),
    })
  })

  it('urlSubCategories が無いグループは urlIds だけ更新', () => {
    expect(
      buildUpdatedGroupAfterUrlIdRemoval(
        {
          domain: 'example.com',
          id: 'g1',
          memberships: ['u1', 'u2'].map((urlId) => ({ urlId })),
        },
        [{ urlId: 'u2' }],
      ),
    ).toStrictEqual({
      domain: 'example.com',
      id: 'g1',
      memberships: ['u2'].map((urlId) => ({ urlId })),
    })
  })
})

describe('tab-group-state.updateSavedTabParentCategory', () => {
  it('groupId が一致する group だけ parentCategoryId を更新する', () => {
    expect(
      updateSavedTabParentCategory(
        [
          { domain: 'a.example.com', id: 'g1' },
          { domain: 'b.example.com', id: 'g2' },
        ],
        'g1',
        'cat-1',
      ),
    ).toStrictEqual([
      { domain: 'a.example.com', id: 'g1', parentCategoryId: 'cat-1' },
      { domain: 'b.example.com', id: 'g2' },
    ])
  })
})

describe('tab-group-state.syncGroupCategoryAssignment', () => {
  it('ID 一致カテゴリと domain 一致カテゴリの両方が反映される', () => {
    const updatedCategories: ParentCategoryDto[] = [
      {
        collections: [{ id: 'domain-reference', domain: 'example.com' }],
        id: 'cat-1',
        name: 'Reading',
      },
    ]
    const state = {
      categoriesChanged: false,
      savedTabsChanged: false,
      updatedCategories,
      updatedSavedTabs: [{ domain: 'example.com', id: 'g1' }],
    }
    const result = syncGroupCategoryAssignment(
      { domain: 'example.com', id: 'g1' },
      buildPresentationCategoryLookup(state.updatedCategories),
      state,
    )
    expect(result.savedTabsChanged).toBe(true)
    expect(result.categoriesChanged).toBe(true)
    expect(result.updatedSavedTabs[0]?.parentCategoryId).toBe('cat-1')
    expect(
      result.updatedCategories
        .find((c) => c.id === 'cat-1')
        ?.collections.map(({ id }) => id),
    ).toStrictEqual(['domain-reference', 'g1'])
  })

  it('domain 一致カテゴリが見つからない場合は state を変更しない', () => {
    const state = {
      categoriesChanged: false,
      savedTabsChanged: false,
      updatedCategories: [] as ParentCategoryDto[],
      updatedSavedTabs: [{ domain: 'example.com', id: 'g1' }],
    }
    const result = syncGroupCategoryAssignment(
      { domain: 'example.com', id: 'g1' },
      buildPresentationCategoryLookup([]),
      state,
    )
    expect(result).toBe(state)
  })
})
