import { describe, expect, it } from 'vitest'

import type { OpenedUrlsRestoreSnapshot } from '@/contexts/saved-tabs/application/commands/RestoreOpenedUrlsSnapshotCommand'
import type { SavedTabsDisplayTabGroupDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { createParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import {
  createCustomProject,
  createTabGroup,
} from '@/contexts/saved-tabs/testing/createCurrentCollectionFixtures'

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

const project = createCustomProject({
  categories: ['Research'],
  createdAt: 1,
  id: 'project-1',
  memberships: [{ category: 'Research', notes: 'memo', urlId: 'url-1' }],
  name: 'Reading',
  updatedAt: 2,
})
const group = createTabGroup({
  domain: 'example.com',
  id: 'group-1',
  memberships: [{ category: 'Docs', urlId: 'url-1' }],
  parentCategoryId: 'category-1',
  savedAt: 10,
  subCategories: ['Docs'],
})
const category = createParentCategory({
  collections: [{ domain: 'example.com', id: 'group-1' }],
  id: 'category-1',
  name: 'Docs',
})

const snapshot = (
  overrides: OpenedUrlsRestoreSnapshot = {},
): OpenedUrlsRestoreSnapshot => overrides

describe('SavedTabsSnapshotMapper current projection', () => {
  it('custom projectをnested projectionごとdeep copyする', () => {
    const copied = toStorageCustomProject(project)
    const copiedRaw = toStorageCustomProjectFromRaw(project)

    expect(copied).toStrictEqual(project)
    expect(copiedRaw).toStrictEqual(project)
    expect(copied).not.toBe(project)
    expect(copied.collectionCategories).not.toBe(project.collectionCategories)
    expect(copied.memberships).not.toBe(project.memberships)
  })

  it('parent categoryをcollection referencesごとcopyする', () => {
    const copied = toStorageParentCategory(category)
    expect(copied).toStrictEqual(category)
    expect(copied).not.toBe(category)
    expect(copied.collections).not.toBe(category.collections)
  })

  it('tab groupをcurrent collection projectionへcopyしresolved read modelを残さない', () => {
    const displayGroup: SavedTabsDisplayTabGroupDto = {
      ...group,
      resolvedUrls: [{ title: 'Example', url: 'https://example.com' }],
    }
    const copied = toStorageTabGroup(displayGroup)

    expect(copied).toStrictEqual(group)
    expect('resolvedUrls' in copied).toBe(false)
    expect(copied.memberships).not.toBe(group.memberships)
  })

  it('snapshot savedTabs未指定・不正値・current配列を扱う', () => {
    expect(getSnapshotSavedTabs(snapshot())).toStrictEqual([])
    expect(
      getSnapshotSavedTabs(snapshot({ savedTabs: 'invalid' as never })),
    ).toStrictEqual([])
    const copied = getSnapshotSavedTabs(snapshot({ savedTabs: [group] }))
    expect(copied).toStrictEqual([group])
    expect(copied[0]).not.toBe(group)
  })

  it('parent categoriesをdomainへ変換しURL風domainはhostnameへ正規化する', () => {
    expect(toDomainParentCategories(undefined)).toBeUndefined()
    const result = toDomainParentCategories([
      {
        collections: [
          { domain: 'https://example.com/path', id: 'group-1' },
          { domain: 'plain.org', id: 'group-2' },
        ],
        id: 'category-1',
        name: 'Docs',
      },
    ])
    expect(result?.[0]?.collections.map(({ domain }) => domain)).toStrictEqual([
      'example.com',
      'plain.org',
    ])
  })

  it('tab group reorder/domain/application bridgesはnormalized projectionをcopyする', () => {
    expect(toDomainTabGroupsForReorder([group])).toStrictEqual([group])
    expect(toDomainTabGroupsFromStorage([group])).toStrictEqual([group])
    expect(toSavedTabsTabGroupsFromStorage([group])).toStrictEqual([group])
  })

  it('restore commandはsnapshotをそのまま包む', () => {
    const value = snapshot({ savedTabs: [group] })
    expect(toRestoreOpenedUrlsSnapshotCommand(value)).toStrictEqual({
      snapshot: value,
    })
  })

  it('custom projectsのundefined/空/current配列を保持してcopyする', () => {
    expect(toStorageCustomProjects(snapshot())).toBeUndefined()
    expect(toStorageCustomProjects(snapshot({ customProjects: [] }))).toEqual(
      [],
    )
    const copied = toStorageCustomProjects(
      snapshot({ customProjects: [project] }),
    )
    expect(copied).toStrictEqual([project])
    expect(copied?.[0]).not.toBe(project)
  })

  it('parent category snapshotのundefined/current配列を保持してcopyする', () => {
    expect(toStorageParentCategories(snapshot())).toBeUndefined()
    const copied = toStorageParentCategories(
      snapshot({ parentCategories: [category] }),
    )
    expect(copied).toStrictEqual([category])
    expect(copied?.[0]).not.toBe(category)
    expect(toDomainParentCategoriesFromStorage([category])).toStrictEqual([
      category,
    ])
  })
})
