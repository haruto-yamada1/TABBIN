import type { CategoryAssignmentPort } from '@/contexts/saved-tabs/application/ports/CategoryAssignmentPort'
import type { ClockPort } from '@/contexts/saved-tabs/application/ports/ClockPort'
import type { IdGeneratorPort } from '@/contexts/saved-tabs/application/ports/IdGeneratorPort'

import type { IndexedDbSavedTabsMutableState } from './IndexedDbSavedTabsSessionService'

type CategoryProjection = Parameters<
  CategoryAssignmentPort['saveTabGroups']
>[0][number]

type MetadataSource = {
  readonly clock: ClockPort
  readonly idGenerator: IdGeneratorPort
}

const allocateCategoryId = (
  candidate: string,
  reserved: Set<string>,
  external: MetadataSource,
): string => {
  const id = reserved.has(candidate)
    ? external.idGenerator.generate()
    : candidate
  if (!id.trim() || reserved.has(id)) {
    throw new Error('Category projection did not produce a unique category ID.')
  }
  reserved.add(id)
  return id
}

/** Compact UI category edits carry content and order, but not native identity/history. */
export const preserveCategoryProjectionMetadata = (
  state: IndexedDbSavedTabsMutableState,
  groups: Parameters<CategoryAssignmentPort['saveTabGroups']>[0],
  external: MetadataSource,
): readonly CategoryProjection[] => {
  const collections = new Map(
    state.collections.map((collection) => [collection.id, collection]),
  )
  const reserved = new Set(state.categories.map(({ id }) => id))
  return groups.map((group) => {
    const currentCollection = collections.get(group.collection.id)
    const currentCategories = new Map(
      state.categories
        .filter(({ collectionId }) => collectionId === group.collection.id)
        .map((category) => [category.name, category]),
    )
    const projectedNameById = new Map(
      group.collectionCategories.map(({ id, name }) => [id, name]),
    )
    const categories = group.collectionCategories.map((category) => {
      const current = currentCategories.get(category.name)
      return {
        ...category,
        id: current?.id ?? allocateCategoryId(category.id, reserved, external),
        createdAt: current?.createdAt ?? category.createdAt,
        updatedAt: current?.updatedAt ?? category.updatedAt,
      }
    })
    const categoryIdByName = new Map(
      categories.map(({ name, id }) => [name, id]),
    )
    const currentMemberships = new Map(
      state.memberships
        .filter(({ collectionId }) => collectionId === group.collection.id)
        .map((membership) => [membership.urlId, membership]),
    )
    const memberships = group.memberships.map((membership) => {
      const current = currentMemberships.get(membership.urlId)
      const name =
        membership.categoryId !== undefined
          ? projectedNameById.get(membership.categoryId)
          : undefined
      if (membership.categoryId !== undefined && name === undefined) {
        throw new Error(
          'Category projection membership refers to an unknown category.',
        )
      }
      const categoryId =
        name !== undefined ? categoryIdByName.get(name) : undefined
      const {
        categoryId: _projectedId,
        addedAtProvenance: _projectedProvenance,
        ...rest
      } = membership
      const provenance =
        current?.addedAtProvenance ?? membership.addedAtProvenance
      return {
        ...rest,
        ...(categoryId !== undefined ? { categoryId } : {}),
        addedAt: current?.addedAt ?? membership.addedAt,
        ...(provenance !== undefined ? { addedAtProvenance: provenance } : {}),
        updatedAt: current?.updatedAt ?? membership.updatedAt,
        sortOrder: current?.sortOrder ?? membership.sortOrder,
      }
    })
    const position = Object.hasOwn(
      group.collection,
      'uncategorizedCategoryPosition',
    )
      ? group.collection.uncategorizedCategoryPosition
      : currentCollection?.uncategorizedCategoryPosition
    return {
      ...group,
      collection: {
        ...group.collection,
        createdAt: currentCollection?.createdAt ?? group.collection.createdAt,
        updatedAt: currentCollection?.updatedAt ?? group.collection.updatedAt,
        sortOrder: currentCollection?.sortOrder ?? group.collection.sortOrder,
        ...(position !== undefined
          ? { uncategorizedCategoryPosition: position }
          : {}),
      },
      collectionCategories: categories,
      memberships,
    }
  })
}
