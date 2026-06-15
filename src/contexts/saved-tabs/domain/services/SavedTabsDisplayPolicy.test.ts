import { describe, expect, it } from 'vitest'

import type { TabGroupDto } from '../dto/TabGroupDto'
import { hasDisplayableUrls } from './SavedTabsDisplayPolicy'

const makeGroup = (overrides: Partial<TabGroupDto> = {}): TabGroupDto => ({
  domain: 'example.com',
  id: 'group-1',
  ...overrides,
})

describe('SavedTabsDisplayPolicy.hasDisplayableUrls', () => {
  it('新形式 urlIds が 1 件以上あれば true を返す', () => {
    expect(hasDisplayableUrls(makeGroup({ urlIds: ['url-1'] }))).toBe(true)
  })

  it('旧形式 urls が 1 件以上あれば true を返す', () => {
    expect(
      hasDisplayableUrls(
        makeGroup({
          urls: [{ title: 'A', url: 'https://example.com' }],
        }),
      ),
    ).toBe(true)
  })

  it('新形式旧形式両方の URL を持っていても true を返す', () => {
    expect(
      hasDisplayableUrls(
        makeGroup({
          urlIds: ['url-1'],
          urls: [{ title: 'A', url: 'https://example.com' }],
        }),
      ),
    ).toBe(true)
  })

  it('新形式旧形式ともに空配列なら false を返す', () => {
    expect(hasDisplayableUrls(makeGroup({ urlIds: [], urls: [] }))).toBe(false)
  })

  it('フィールド自体が無いグループは false を返す', () => {
    expect(hasDisplayableUrls(makeGroup())).toBe(false)
  })

  it('空 urlIds (undefined) と 1 件 urls を持つグループは true を返す', () => {
    expect(
      hasDisplayableUrls(
        makeGroup({
          urls: [{ title: 'A', url: 'https://example.com' }],
        }),
      ),
    ).toBe(true)
  })
})
