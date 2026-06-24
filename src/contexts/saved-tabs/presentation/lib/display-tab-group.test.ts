import { describe, expect, it } from 'vitest'

import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsTabGroupDto as TabGroup,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'

import { buildDisplayTabGroup, getDisplayUrlCount } from './display-tab-group'

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
  urlIds: [],
  urls: [],
  ...overrides,
})

describe('getDisplayUrlCount', () => {
  it('urls が指定されていればその長さを返す', () => {
    expect(
      getDisplayUrlCount(
        makeGroup({
          urls: [
            { title: 'a', url: 'https://a.example.com' },
            { title: 'b', url: 'https://b.example.com' },
          ],
        }),
      ),
    ).toBe(2)
  })

  it('urlIds が指定されていればその長さを返す (旧形式)', () => {
    expect(getDisplayUrlCount(makeGroup({ urlIds: ['u1', 'u2', 'u3'] }))).toBe(
      3,
    )
  })

  it('urls が優先で urlIds はフォールバック', () => {
    expect(
      getDisplayUrlCount(
        makeGroup({
          urlIds: ['u1'],
          urls: [
            { title: 'a', url: 'https://a.example.com' },
            { title: 'b', url: 'https://b.example.com' },
          ],
        }),
      ),
    ).toBe(2)
  })

  it('両方未定義なら 0', () => {
    expect(getDisplayUrlCount(makeGroup())).toBe(0)
  })

  it('両方空配列なら 0', () => {
    expect(getDisplayUrlCount(makeGroup({ urlIds: [], urls: [] }))).toBe(0)
  })
})

describe('buildDisplayTabGroup', () => {
  it('project 名を domain に流用した TabGroup を返す', () => {
    const result = buildDisplayTabGroup(
      makeProject({ id: 'p1', name: 'Reading List' }),
    )
    expect(result.id).toBe('p1')
    expect(result.domain).toBe('Reading List')
  })

  it('urls / urlIds が未定義なら空配列で詰める', () => {
    const result = buildDisplayTabGroup(
      makeProject({ id: 'p1', name: 'No Urls' }),
    )
    expect(result.urls).toStrictEqual([])
    expect(result.urlIds).toStrictEqual([])
  })

  it('urls / urlIds があればそのままコピーする', () => {
    const result = buildDisplayTabGroup(
      makeProject({
        id: 'p1',
        name: 'With Urls',
        urlIds: ['u1', 'u2'],
        urls: [{ title: 'a', url: 'https://a.example.com' }],
      }),
    )
    expect(result.urlIds).toStrictEqual(['u1', 'u2'])
    expect(result.urls).toStrictEqual([
      { title: 'a', url: 'https://a.example.com' },
    ])
  })
})
