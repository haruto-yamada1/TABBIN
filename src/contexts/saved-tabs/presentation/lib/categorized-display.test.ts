import { describe, expect, it } from 'vitest'

import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsTabGroupDto as TabGroup,
} from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

import { createCategorizedDisplayState } from './categorized-display'

const makeGroup = (overrides: Partial<TabGroup> = {}): TabGroup => ({
  domain: 'example.com',
  id: 'group-1',
  ...overrides,
})

const makeProject = (
  overrides: Partial<CustomProject> = {},
): CustomProject => ({
  categories: [],
  createdAt: 0,
  id: 'project-1',
  name: 'My Project',
  updatedAt: 0,
  memberships: [].map((urlId) => ({ urlId })),
  urls: [],
  ...overrides,
})

const baseInput = {
  categorized: {} as Record<string, TabGroup[]>,
  enableCategories: true,
  filteredCustomProjects: [] as readonly CustomProject[],
  isUncategorizedReorderMode: false,
  searchQuery: '',
  tempUncategorizedOrder: [] as readonly TabGroup[],
  uncategorized: [] as readonly TabGroup[],
  viewMode: 'domain' as const,
}

describe('createCategorizedDisplayState.hasContentTabGroups', () => {
  it('categorized と uncategorized のうち表示対象 URL を持つグループだけ返す', () => {
    const displayable = makeGroup({
      id: 'a',
      memberships: ['u1'].map((urlId) => ({ urlId })),
    })
    const empty = makeGroup({
      id: 'b',
      memberships: [].map((urlId) => ({ urlId })),
    })
    const result = createCategorizedDisplayState({
      ...baseInput,
      categorized: { cat: [empty, displayable] },
      uncategorized: [empty, displayable],
    })
    expect(result.hasContentTabGroups.map((g) => g.id)).toStrictEqual([
      'a',
      'a',
    ])
  })

  it('何も表示対象がないときは空配列', () => {
    const result = createCategorizedDisplayState({
      ...baseInput,
      uncategorized: [
        makeGroup({ id: 'a', memberships: [].map((urlId) => ({ urlId })) }),
      ],
    })
    expect(result.hasContentTabGroups).toStrictEqual([])
  })
})

describe('createCategorizedDisplayState.visibleUncategorizedGroups', () => {
  it('uncategorized のうち表示対象 URL を持つグループだけ返す', () => {
    const empty = makeGroup({
      id: 'b',
      memberships: [].map((urlId) => ({ urlId })),
    })
    const displayable = makeGroup({
      id: 'a',
      memberships: ['u1'].map((urlId) => ({ urlId })),
    })
    const result = createCategorizedDisplayState({
      ...baseInput,
      uncategorized: [empty, displayable],
    })
    expect(result.visibleUncategorizedGroups.map((g) => g.id)).toStrictEqual([
      'a',
    ])
  })
})

describe('createCategorizedDisplayState.hasVisibleCategoryGroups', () => {
  it('enableCategories=true かつ categorized が1件以上なら true', () => {
    const result = createCategorizedDisplayState({
      ...baseInput,
      categorized: { cat: [makeGroup({ id: 'a' })] },
      enableCategories: true,
    })
    expect(result.hasVisibleCategoryGroups).toBe(true)
  })

  it('enableCategories=false なら categorized に件数があっても false', () => {
    const result = createCategorizedDisplayState({
      ...baseInput,
      categorized: { cat: [makeGroup({ id: 'a' })] },
      enableCategories: false,
    })
    expect(result.hasVisibleCategoryGroups).toBe(false)
  })

  it('categorized が空オブジェクトなら false', () => {
    const result = createCategorizedDisplayState({
      ...baseInput,
      enableCategories: true,
    })
    expect(result.hasVisibleCategoryGroups).toBe(false)
  })
})

describe('createCategorizedDisplayState.shouldShowUncategorizedSectionHeader', () => {
  it('enableCategories=false なら false', () => {
    const result = createCategorizedDisplayState({
      ...baseInput,
      enableCategories: false,
      uncategorized: [
        makeGroup({ id: 'a', memberships: ['u1'].map((urlId) => ({ urlId })) }),
      ],
    })
    expect(result.shouldShowUncategorizedSectionHeader).toBe(false)
  })

  it('enableCategories=true で未分類なしなら false', () => {
    const result = createCategorizedDisplayState({
      ...baseInput,
      enableCategories: true,
      uncategorized: [],
    })
    expect(result.shouldShowUncategorizedSectionHeader).toBe(false)
  })

  it('enableCategories=true で表示対象未分類ありなら true', () => {
    const result = createCategorizedDisplayState({
      ...baseInput,
      enableCategories: true,
      uncategorized: [
        makeGroup({ id: 'a', memberships: ['u1'].map((urlId) => ({ urlId })) }),
      ],
    })
    expect(result.shouldShowUncategorizedSectionHeader).toBe(true)
  })

  it('検索クエリありで visibleUncategorizedCount=0、並び替え中でないなら false', () => {
    // visibleUncategorizedCount=0 にするには uncategorized 内のグループが
    // 表示対象 URL を持たない状態にする必要がある。urlIds=[] / urls=undefined
    // のグループを 1 件渡すと、hasDisplayableUrls=false でフィルタされ、
    // visibleUncategorizedCount=0 / uncategorizedCount=1 になる。
    const result = createCategorizedDisplayState({
      ...baseInput,
      enableCategories: true,
      searchQuery: 'nomatch',
      uncategorized: [
        makeGroup({ id: 'a', memberships: [].map((urlId) => ({ urlId })) }),
      ],
    })
    expect(result.shouldShowUncategorizedSectionHeader).toBe(false)
  })
})

describe('createCategorizedDisplayState.shouldShowUncategorizedList', () => {
  it('visibleUncategorizedGroups が1件以上なら true', () => {
    const result = createCategorizedDisplayState({
      ...baseInput,
      uncategorized: [
        makeGroup({ id: 'a', memberships: ['u1'].map((urlId) => ({ urlId })) }),
      ],
    })
    expect(result.shouldShowUncategorizedList).toBe(true)
  })

  it('表示対象未分類が0件なら false', () => {
    const result = createCategorizedDisplayState({
      ...baseInput,
      uncategorized: [
        makeGroup({ id: 'a', memberships: [].map((urlId) => ({ urlId })) }),
      ],
    })
    expect(result.shouldShowUncategorizedList).toBe(false)
  })
})

describe('createCategorizedDisplayState.uncategorizedForDisplay', () => {
  it('通常時は uncategorized を表示対象 URL のみで返す', () => {
    const result = createCategorizedDisplayState({
      ...baseInput,
      isUncategorizedReorderMode: false,
      uncategorized: [
        makeGroup({ id: 'a', memberships: ['u1'].map((urlId) => ({ urlId })) }),
        makeGroup({ id: 'b', memberships: [].map((urlId) => ({ urlId })) }),
      ],
    })
    expect(result.uncategorizedForDisplay.map((g) => g.id)).toStrictEqual(['a'])
  })

  it('並び替えモード時は tempUncategorizedOrder を表示対象 URL のみで返す', () => {
    const result = createCategorizedDisplayState({
      ...baseInput,
      isUncategorizedReorderMode: true,
      tempUncategorizedOrder: [
        makeGroup({ id: 'a', memberships: ['u1'].map((urlId) => ({ urlId })) }),
        makeGroup({ id: 'b', memberships: [].map((urlId) => ({ urlId })) }),
        makeGroup({ id: 'c', memberships: ['u2'].map((urlId) => ({ urlId })) }),
      ],
      uncategorized: [],
    })
    expect(result.uncategorizedForDisplay.map((g) => g.id)).toStrictEqual([
      'a',
      'c',
    ])
  })
})

describe('createCategorizedDisplayState.headerFilteredTabGroups', () => {
  it('viewMode=domain なら hasContentTabGroups をそのまま返す', () => {
    const result = createCategorizedDisplayState({
      ...baseInput,
      uncategorized: [
        makeGroup({ id: 'a', memberships: ['u1'].map((urlId) => ({ urlId })) }),
      ],
      viewMode: 'domain',
    })
    expect(result.headerFilteredTabGroups.map((g) => g.id)).toStrictEqual(['a'])
  })

  it('viewMode=custom なら filteredCustomProjects を buildDisplayTabGroup で投影する', () => {
    const result = createCategorizedDisplayState({
      ...baseInput,
      filteredCustomProjects: [
        makeProject({ id: 'p1', name: 'Project A' }),
        makeProject({ id: 'p2', name: 'Project B' }),
      ],
      viewMode: 'custom',
    })
    expect(result.headerFilteredTabGroups.map((g) => g.id)).toStrictEqual([
      'p1',
      'p2',
    ])
    expect(result.headerFilteredTabGroups.map((g) => g.domain)).toStrictEqual([
      'Project A',
      'Project B',
    ])
  })
})
