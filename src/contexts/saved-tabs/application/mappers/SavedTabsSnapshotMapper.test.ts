import { describe, expect, it } from 'vitest' // eslint-disable-line

import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import {
  toSavedTabsCustomProjectDto,
  toSavedTabsTabGroupDto,
} from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import { createTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'

import {
  getSnapshotSavedTabs,
  toDomainParentCategories,
  toDomainParentCategoriesFromStorage,
  toDomainTabGroupsFromStorage,
  toDomainTabGroupsForReorder,
  toRestoreOpenedUrlsSnapshotCommand,
  toSavedTabsTabGroupsFromStorage,
  toStorageCustomProject,
  toStorageCustomProjectFromRaw,
  toStorageCustomProjects,
  toStorageParentCategory,
  toStorageParentCategories,
  toStorageTabGroup,
} from './SavedTabsSnapshotMapper'

const buildSnapshot = (
  overrides: Partial<OpenedUrlsRestoreSnapshot> = {},
): OpenedUrlsRestoreSnapshot => ({
  customProjectOrder: undefined,
  customProjects: undefined,
  parentCategories: undefined,
  savedTabs: undefined,
  urlRecords: undefined,
  ...overrides,
})

describe('SavedTabsSnapshotMapper.toStorageCustomProject', () => {
  it('domain entity の CustomProject を storage 形へコピーし、配列フィールドを新規配列にする', () => {
    const result = toStorageCustomProject(
      createCustomProject({
        categories: ['cat-1'],
        createdAt: 1,
        id: 'project-1',
        name: 'Reading',
        updatedAt: 2,
        urlIds: ['url-1', 'url-2'],
      }),
    )
    expect(result).toStrictEqual({
      categories: ['cat-1'],
      createdAt: 1,
      id: 'project-1',
      name: 'Reading',
      updatedAt: 2,
      urlIds: ['url-1', 'url-2'],
    })
    expect(result).toMatchObject({
      categories: ['cat-1'],
      createdAt: 1,
      id: 'project-1',
      name: 'Reading',
      updatedAt: 2,
      urlIds: ['url-1', 'url-2'],
    })
    // mapper 戻り値は storage 形 (mutable) であり、push が通る。
    if (result.urlIds) {
      result.urlIds.push('url-3')
    }
    expect(result.urlIds).toStrictEqual(['url-1', 'url-2', 'url-3'])
  })
})

describe('SavedTabsSnapshotMapper.toStorageCustomProjectFromRaw', () => {
  it('raw snapshot の rich フィールドを storage 形へ複製する', () => {
    const result = toStorageCustomProjectFromRaw({
      categories: ['research'],
      categoryOrder: ['research', 'news'],
      createdAt: 1,
      id: 'project-1',
      name: 'Q4',
      projectKeywords: {
        domainKeywords: ['example.com'],
        titleKeywords: ['design'],
        urlKeywords: ['plan'],
      },
      updatedAt: 2,
      urlIds: ['url-1'],
      urlMetadata: {
        'url-1': { category: 'research', notes: 'note-1' },
      },
      urls: [{ title: 'A', url: 'https://example.com/a' }],
    })

    expect(result).toStrictEqual({
      categories: ['research'],
      categoryOrder: ['research', 'news'],
      createdAt: 1,
      id: 'project-1',
      name: 'Q4',
      projectKeywords: {
        domainKeywords: ['example.com'],
        titleKeywords: ['design'],
        urlKeywords: ['plan'],
      },
      updatedAt: 2,
      urlIds: ['url-1'],
      urlMetadata: {
        'url-1': { category: 'research', notes: 'note-1' },
      },
      urls: [{ title: 'A', url: 'https://example.com/a' }],
    })
  })
})

describe('SavedTabsSnapshotMapper.toStorageParentCategory', () => {
  it('domain entity の ParentCategory を storage 形へコピーする', () => {
    expect(
      toStorageParentCategory(
        createParentCategory({
          domains: ['group-1'],
          domainNames: ['example.com'],
          id: 'cat-1',
          name: 'Reading',
        }),
      ),
    ).toStrictEqual({
      domains: ['group-1'],
      domainNames: ['example.com'],
      id: 'cat-1',
      name: 'Reading',
    })
  })
})

describe('SavedTabsSnapshotMapper.toStorageTabGroup', () => {
  it('domain entity の TabGroup を storage 形へコピーする (urls は捨てる)', () => {
    const result = toStorageTabGroup(
      createTabGroup({
        domain: 'example.com',
        id: 'group-1',
        parentCategoryId: 'cat-1',
        savedAt: 10,
        urlIds: ['url-1'],
      }),
    )
    expect(result).toStrictEqual({
      domain: 'example.com',
      id: 'group-1',
      parentCategoryId: 'cat-1',
      savedAt: 10,
      urlIds: ['url-1'],
    })
    expect('urls' in result).toBe(false)
  })
})

describe('SavedTabsSnapshotMapper.getSnapshotSavedTabs', () => {
  it('savedTabs 未指定なら空配列を返す', () => {
    expect(getSnapshotSavedTabs(buildSnapshot())).toStrictEqual([])
  })

  it('savedTabs が配列以外なら空配列を返す', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    expect(
      getSnapshotSavedTabs(buildSnapshot({ savedTabs: 'invalid' as never })),
    ).toStrictEqual([])
  })

  it('savedTabs を storage 形 TabGroup[] へ変換して返す', () => {
    const result = getSnapshotSavedTabs(
      buildSnapshot({
        savedTabs: [
          toSavedTabsTabGroupDto(
            createTabGroup({
              domain: 'example.com',
              id: 'group-1',
              parentCategoryId: 'cat-1',
              savedAt: 10,
              urlIds: ['url-1'],
            }),
          ),
        ],
      }),
    )
    expect(result).toStrictEqual([
      {
        domain: 'example.com',
        id: 'group-1',
        parentCategoryId: 'cat-1',
        savedAt: 10,
        urlIds: ['url-1'],
      },
    ])
  })
})

describe('SavedTabsSnapshotMapper.toDomainParentCategories', () => {
  it('undefined 入力は undefined を返す', () => {
    expect(toDomainParentCategories(undefined)).toBeUndefined()
  })

  it('storage 形 ParentCategory[] を branded 互換の形へ持ち替える', () => {
    const result = toDomainParentCategories([
      {
        domains: ['group-1'],
        domainNames: ['example.com'],
        id: 'cat-1',
        name: 'Reading',
      },
    ])
    expect(result).toBeDefined()
    expect(result?.[0]).toMatchObject({
      domains: ['group-1'],
      domainNames: ['example.com'],
      id: 'cat-1',
      name: 'Reading',
    })
  })

  // 回帰: 保存フロー (lib/storage/migration getTabDomain) が
  // `https://example.com` のようにスキーム付き文字列を domainNames に書き込む
  // 既存データを開くとき、toDomainParentCategories 経由で
  // createDomainName が「ドメイン名にスキームを含めることはできません」を投げて
  // useTabOpeningHandlers.handleOpenTab がタブを開けなくする不具合の回帰。
  it('domainNames にスキーム付き文字列が含まれても hostname へ正規化して例外を投げない', () => {
    const result = toDomainParentCategories([
      {
        domains: ['group-1'],
        domainNames: [
          'https://example.com',
          'http://other.com/path',
          'plain.org',
        ],
        id: 'cat-1',
        name: 'Reading',
      },
    ])
    expect(result?.[0].domainNames).toStrictEqual([
      'example.com',
      'other.com',
      'plain.org',
    ])
  })
})

describe('SavedTabsSnapshotMapper.toDomainTabGroupsForReorder', () => {
  it('storage 形 TabGroup[] を use-case 入力の形へ持ち替える', () => {
    const result = toDomainTabGroupsForReorder([
      {
        domain: 'a.example.com',
        id: 'group-a',
        parentCategoryId: 'cat-1',
        savedAt: 1,
        urlIds: ['url-1'],
      },
    ])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      domain: 'a.example.com',
      id: 'group-a',
      parentCategoryId: 'cat-1',
      savedAt: 1,
      urlIds: ['url-1'],
    })
  })

  it('urlIds が undefined のグループは空配列で詰める', () => {
    const result = toDomainTabGroupsForReorder([
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      { domain: 'a.example.com', id: 'group-a' } as never,
    ])
    expect(result[0]?.urlIds).toStrictEqual([])
  })
})

describe('SavedTabsSnapshotMapper.toRestoreOpenedUrlsSnapshotCommand', () => {
  it('snapshot をそのままコマンドに包む', () => {
    const snapshot = buildSnapshot({ savedTabs: [] })
    expect(toRestoreOpenedUrlsSnapshotCommand(snapshot)).toStrictEqual({
      snapshot,
    })
  })
})

describe('SavedTabsSnapshotMapper.toStorageCustomProjects', () => {
  it('undefined 入力は undefined を返す', () => {
    expect(toStorageCustomProjects(buildSnapshot())).toBeUndefined()
  })

  it('customProjects が空配列のものは空配列を維持', () => {
    expect(
      toStorageCustomProjects(buildSnapshot({ customProjects: [] })),
    ).toStrictEqual([])
  })

  it('customProjects を storage 形配列へ変換する', () => {
    expect(
      toStorageCustomProjects(
        buildSnapshot({
          customProjects: [
            toSavedTabsCustomProjectDto(
              createCustomProject({
                categories: ['cat-1'],
                createdAt: 1,
                id: 'project-1',
                name: 'Reading',
                updatedAt: 2,
                urlIds: ['url-1'],
              }),
            ),
          ],
        }),
      ),
    ).toStrictEqual([
      {
        categories: ['cat-1'],
        createdAt: 1,
        id: 'project-1',
        name: 'Reading',
        updatedAt: 2,
        urlIds: ['url-1'],
      },
    ])
  })
})

describe('SavedTabsSnapshotMapper.toStorageParentCategories', () => {
  it('undefined 入力は undefined を返す', () => {
    expect(toStorageParentCategories(buildSnapshot())).toBeUndefined()
  })

  it('parentCategories を storage 形配列へ変換する', () => {
    expect(
      toStorageParentCategories(
        buildSnapshot({
          parentCategories: [
            createParentCategory({
              domains: ['group-1'],
              domainNames: ['example.com'],
              id: 'cat-1',
              name: 'Reading',
            }),
          ],
        }),
      ),
    ).toStrictEqual([
      {
        domains: ['group-1'],
        domainNames: ['example.com'],
        id: 'cat-1',
        name: 'Reading',
      },
    ])
  })
})

describe('SavedTabsSnapshotMapper storage application bridges', () => {
  it('storage tab groupsをdomainとapplication DTOへ変換する', () => {
    const groups = [
      {
        domain: 'example.com',
        id: 'group-1',
        parentCategoryId: 'category-1',
        savedAt: 1,
        urlIds: ['url-1'],
      },
    ]

    expect(toDomainTabGroupsFromStorage(groups)[0]).toMatchObject({
      domain: 'example.com',
      id: 'group-1',
      urlIds: ['url-1'],
    })
    expect(toSavedTabsTabGroupsFromStorage(groups)).toStrictEqual([
      {
        domain: 'example.com',
        id: 'group-1',
        parentCategoryId: 'category-1',
        savedAt: 1,
        urlIds: ['url-1'],
      },
    ])
  })

  it('storage parent categoriesをdomainへ変換する', () => {
    expect(
      toDomainParentCategoriesFromStorage([
        {
          domainNames: ['example.com'],
          domains: ['group-1'],
          id: 'category-1',
          name: 'Docs',
        },
      ]),
    ).toStrictEqual([
      {
        domainNames: ['example.com'],
        domains: ['group-1'],
        id: 'category-1',
        name: 'Docs',
      },
    ])
  })
})
