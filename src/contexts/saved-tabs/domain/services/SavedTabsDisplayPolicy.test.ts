import { describe, expect, it } from 'vitest'

import type { ResolvedTabGroupUrlDto } from '@/contexts/saved-tabs/domain/dto/ResolvedTabGroupUrlDto'
import type { TabGroupDto } from '@/contexts/saved-tabs/domain/dto/TabGroupDto'
import { createTabGroup } from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

import { hasDisplayableUrls } from './SavedTabsDisplayPolicy'

const makeGroup = ({
  memberships = [],
  resolvedUrls,
}: {
  readonly memberships?: readonly { readonly urlId: string }[]
  readonly resolvedUrls?: readonly ResolvedTabGroupUrlDto[]
} = {}): TabGroupDto => ({
  ...createTabGroup({ id: 'group-1', memberships }),
  ...(resolvedUrls ? { resolvedUrls } : {}),
})

describe('SavedTabsDisplayPolicy.hasDisplayableUrls', () => {
  it('新形式 urlIds が 1 件以上あれば true を返す', () => {
    expect(
      hasDisplayableUrls(
        makeGroup({ memberships: ['url-1'].map((urlId) => ({ urlId })) }),
      ),
    ).toBe(true)
  })

  it('旧形式 urls が 1 件以上あれば true を返す', () => {
    expect(
      hasDisplayableUrls(
        makeGroup({
          resolvedUrls: [{ title: 'A', url: 'https://example.com' }],
        }),
      ),
    ).toBe(true)
  })

  it('新形式旧形式両方の URL を持っていても true を返す', () => {
    expect(
      hasDisplayableUrls(
        makeGroup({
          memberships: ['url-1'].map((urlId) => ({ urlId })),
          resolvedUrls: [{ title: 'A', url: 'https://example.com' }],
        }),
      ),
    ).toBe(true)
  })

  it('新形式旧形式ともに空配列なら false を返す', () => {
    expect(
      hasDisplayableUrls(
        makeGroup({
          memberships: [].map((urlId) => ({ urlId })),
          resolvedUrls: [],
        }),
      ),
    ).toBe(false)
  })

  it('フィールド自体が無いグループは false を返す', () => {
    expect(hasDisplayableUrls(makeGroup())).toBe(false)
  })

  it('空 urlIds (undefined) と 1 件 urls を持つグループは true を返す', () => {
    expect(
      hasDisplayableUrls(
        makeGroup({
          resolvedUrls: [{ title: 'A', url: 'https://example.com' }],
        }),
      ),
    ).toBe(true)
  })
})
