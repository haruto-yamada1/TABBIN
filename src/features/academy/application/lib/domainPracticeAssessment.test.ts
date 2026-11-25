import { describe, expect, it } from 'vitest'

import { createPracticeComposition } from '@/app/composition/createPracticeComposition'
import type { PracticeSnapshotDto } from '@/features/academy/application/dto/PracticeSessionDto'
import { isDomainPracticeStepComplete } from '@/features/academy/application/services/DomainPracticeAssessmentService'
import { getDomainPracticeSteps } from '@/features/academy/domain/domainPracticeLessons'
import { createPracticeSeed } from '@/features/academy/infrastructure/practice/practiceSeed'

const snapshot = () => createPracticeSeed('saved')
const complete = (
  stepId: string,
  before: PracticeSnapshotDto,
  after: PracticeSnapshotDto,
) =>
  isDomainPracticeStepComplete({
    stepId,
    before,
    after,
    beforeActions: [],
    afterActions: [],
  })
const first = <Item>(items: readonly Item[]): Item => {
  const item = items[0]
  if (!item) {
    throw new Error('Missing fixture item')
  }
  return item
}
const ids = [
  'parent-categories',
  'child-categories',
  'reorder-items',
  'restore-tabs',
].flatMap((lessonId) =>
  getDomainPracticeSteps(lessonId).map((step) => step.stepId),
)

describe('Domain practice assessment from committed memory state', () => {
  it('recognizes the production child rename projection even when it replaces the native category ID', async () => {
    const practice = createPracticeComposition()
    const before = practice.getSnapshot()
    const page = await practice.useCases.getSavedTabsPageData()
    await practice.deps.categoryAssignmentPort.saveTabGroups(
      page.tabGroups.map((group) => ({
        ...group,
        collectionCategories: group.collectionCategories.map((category) =>
          group.collection.id === 'practice-domain-0' &&
          category.name === 'Guides'
            ? { ...category, name: 'Research' }
            : category,
        ),
      })),
    )
    const after = practice.getSnapshot()
    expect(complete('child-categories-rename', before, after)).toBe(true)
    expect(complete('child-categories-create', before, after)).toBe(false)
    expect(complete('child-categories-success', before, after)).toBe(false)
    practice.dispose()
  })

  it.each(ids)('does not complete %s on a no-op', (stepId) => {
    const before = snapshot()
    expect(complete(stepId, before, structuredClone(before))).toBe(false)
  })

  it('counts parent creation, rename and assignment only for their own operations', () => {
    const before = snapshot()
    const created: PracticeSnapshotDto = {
      ...before,
      groups: [
        ...before.groups,
        { ...first(before.groups), id: 'created-parent', name: 'Development' },
      ],
    }
    expect(complete('parent-categories-create', before, created)).toBe(true)
    expect(complete('parent-categories-rename', before, created)).toBe(false)
    const renamed: PracticeSnapshotDto = {
      ...created,
      groups: created.groups.map((group) =>
        group.id === 'created-parent' ? { ...group, name: 'Projects' } : group,
      ),
    }
    expect(complete('parent-categories-rename', created, renamed)).toBe(true)
    expect(complete('parent-categories-create', created, renamed)).toBe(false)
    const assigned: PracticeSnapshotDto = {
      ...renamed,
      collections: renamed.collections.map((collection) =>
        collection.id === 'practice-domain-0'
          ? { ...collection, groupId: 'created-parent' }
          : collection,
      ),
    }
    expect(complete('parent-categories-assign', renamed, assigned)).toBe(true)
    expect(complete('parent-categories-success', renamed, assigned)).toBe(true)
    expect(complete('reorder-items-domains', renamed, assigned)).toBe(false)
  })

  it('does not count unassignment, unknown parents, or Custom assignment as a parent move', () => {
    const before = snapshot()
    for (const groupId of [undefined, 'missing-parent']) {
      const after: PracticeSnapshotDto = {
        ...before,
        collections: before.collections.map((collection) => {
          const { groupId: _groupId, ...rest } = collection
          return groupId ? { ...rest, groupId } : rest
        }),
      }
      expect(complete('parent-categories-assign', before, after)).toBe(false)
      expect(complete('parent-categories-success', before, after)).toBe(false)
    }
    const customOnly: PracticeSnapshotDto = {
      ...before,
      collections: before.collections.map((collection) =>
        collection.definition.type === 'custom'
          ? { ...collection, groupId: 'practice-parent-0' }
          : collection,
      ),
    }
    expect(complete('parent-categories-assign', before, customOnly)).toBe(false)
  })

  it('counts child creation, rename and keyword changes within Domain collections', () => {
    const before = snapshot()
    const created: PracticeSnapshotDto = {
      ...before,
      categories: [
        ...before.categories,
        {
          ...first(before.categories),
          id: 'created-child',
          name: 'Topics',
          keywords: [],
        },
      ],
    }
    expect(complete('child-categories-create', before, created)).toBe(true)
    const renamed: PracticeSnapshotDto = {
      ...created,
      categories: created.categories.map((category) =>
        category.id === 'created-child'
          ? { ...category, name: 'Research' }
          : category,
      ),
    }
    expect(complete('child-categories-rename', created, renamed)).toBe(true)
    expect(complete('child-categories-keywords', created, renamed)).toBe(false)
    const edited: PracticeSnapshotDto = {
      ...renamed,
      categories: renamed.categories.map((category) =>
        category.id === 'created-child'
          ? { ...category, keywords: ['scratch'] }
          : category,
      ),
    }
    expect(complete('child-categories-keywords', renamed, edited)).toBe(true)
    expect(complete('child-categories-success', renamed, edited)).toBe(false)
  })

  it('counts an existing Domain URL moved into a child and rejects other membership changes', () => {
    const before = snapshot()
    const moved: PracticeSnapshotDto = {
      ...before,
      memberships: before.memberships.map((membership) =>
        membership.collectionId === 'practice-domain-0' &&
        membership.urlId === 'practice-url-0-1'
          ? { ...membership, categoryId: 'practice-domain-0:category:0' }
          : membership,
      ),
    }
    expect(complete('child-categories-success', before, moved)).toBe(true)
    const invalid: PracticeSnapshotDto = {
      ...before,
      memberships: before.memberships.map((membership) => ({
        ...membership,
        categoryId: 'practice-project:category:0',
      })),
    }
    expect(complete('child-categories-success', before, invalid)).toBe(false)
    expect(
      complete('child-categories-success', before, {
        ...before,
        memberships: [],
      }),
    ).toBe(false)
  })

  it('excludes Custom category edits and URL movements', () => {
    const before = snapshot()
    const after: PracticeSnapshotDto = {
      ...before,
      categories: before.categories.map((category) =>
        category.collectionId === 'practice-project'
          ? {
              ...category,
              name: `${category.name} edited`,
              keywords: ['changed'],
              sortOrder: 1 - category.sortOrder,
            }
          : category,
      ),
      memberships: before.memberships.map((membership) =>
        membership.collectionId === 'practice-project'
          ? { ...membership, categoryId: 'practice-project:category:1' }
          : membership,
      ),
    }
    for (const stepId of ids.filter((id) => id.startsWith('child-'))) {
      expect(complete(stepId, before, after)).toBe(false)
    }
    expect(complete('reorder-items-success', before, after)).toBe(false)
    const added: PracticeSnapshotDto = {
      ...before,
      categories: [
        ...before.categories,
        {
          ...first(before.categories),
          id: 'custom-child',
          collectionId: 'practice-project',
        },
      ],
    }
    expect(complete('child-categories-create', before, added)).toBe(false)
  })

  it('requires a real order change among the same parents, domains or children', () => {
    const before = snapshot()
    expect(
      complete('reorder-items-parents', before, {
        ...before,
        groups: before.groups.map((group) => ({
          ...group,
          sortOrder: 1 - group.sortOrder,
        })),
      }),
    ).toBe(true)
    expect(
      complete('reorder-items-domains', before, {
        ...before,
        collections: before.collections.map((collection) =>
          collection.groupId === 'practice-parent-0'
            ? { ...collection, sortOrder: 2 - collection.sortOrder }
            : collection,
        ),
      }),
    ).toBe(true)
    expect(
      complete('reorder-items-success', before, {
        ...before,
        categories: before.categories.map((category) =>
          category.collectionId === 'practice-domain-0'
            ? { ...category, sortOrder: 1 - category.sortOrder }
            : category,
        ),
      }),
    ).toBe(true)
    expect(
      complete('reorder-items-parents', before, {
        ...before,
        groups: before.groups.map((group) => ({
          ...group,
          sortOrder: group.sortOrder + 10,
        })),
      }),
    ).toBe(false)
    expect(
      complete('reorder-items-success', before, {
        ...before,
        categories: before.categories.slice(1),
      }),
    ).toBe(false)
  })

  it('counts only a newly simulated restoration of a saved Domain URL', () => {
    const before = snapshot()
    const action = { type: 'open' as const, urls: [first(before.urls).url] }
    expect(
      isDomainPracticeStepComplete({
        stepId: 'restore-tabs-success',
        before,
        after: before,
        beforeActions: [],
        afterActions: [action],
      }),
    ).toBe(true)
    expect(
      isDomainPracticeStepComplete({
        stepId: 'restore-tabs-success',
        before,
        after: before,
        beforeActions: [action],
        afterActions: [action],
      }),
    ).toBe(false)
    expect(
      isDomainPracticeStepComplete({
        stepId: 'restore-tabs-success',
        before,
        after: before,
        beforeActions: [],
        afterActions: [{ type: 'window', urls: ['https://unknown.test/'] }],
      }),
    ).toBe(false)
    expect(complete('unknown-step', before, before)).toBe(false)
  })
})
