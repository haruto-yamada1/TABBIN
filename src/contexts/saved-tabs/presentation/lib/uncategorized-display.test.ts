import { describe, expect, it } from 'vitest' // eslint-disable-line

import { shouldShowUncategorizedHeader } from './uncategorized-display'

describe('shouldShowUncategorizedHeader', () => {
  it('親カテゴリが0件でも未分類があれば検索なしでヘッダを表示する', () => {
    expect(
      shouldShowUncategorizedHeader({
        searchQuery: '',
        uncategorizedCount: 2,
        visibleUncategorizedCount: 2,
        isUncategorizedReorderMode: false,
      }),
    ).toBe(true)
  })

  it('検索中は表示対象の未分類があるときだけヘッダを表示する', () => {
    expect(
      shouldShowUncategorizedHeader({
        searchQuery: 'docs',
        uncategorizedCount: 2,
        visibleUncategorizedCount: 1,
        isUncategorizedReorderMode: false,
      }),
    ).toBe(true)
  })

  it('検索中に表示対象がなくても並び替え中ならヘッダを表示する', () => {
    expect(
      shouldShowUncategorizedHeader({
        searchQuery: 'docs',
        uncategorizedCount: 2,
        visibleUncategorizedCount: 0,
        isUncategorizedReorderMode: true,
      }),
    ).toBe(true)
  })

  it('未分類がなく並び替え中でもない場合はヘッダを表示しない', () => {
    expect(
      shouldShowUncategorizedHeader({
        searchQuery: '',
        uncategorizedCount: 0,
        visibleUncategorizedCount: 0,
        isUncategorizedReorderMode: false,
      }),
    ).toBe(false)
  })

  it('検索中に表示対象がなく並び替え中でない場合はヘッダを表示しない', () => {
    expect(
      shouldShowUncategorizedHeader({
        searchQuery: 'docs',
        uncategorizedCount: 2,
        visibleUncategorizedCount: 0,
        isUncategorizedReorderMode: false,
      }),
    ).toBe(false)
  })
})
