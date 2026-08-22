import type {
  SavedTabsCustomProjectDto,
  SavedTabsDisplayTabGroupDto,
  SavedTabsTabGroupDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import {
  createSavedTabsCustomProjectDtoFromProjection,
  createSavedTabsTabGroupDtoFromProjection,
} from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import type {
  SavedTabsCustomProjectViewModel,
  SavedTabsDisplayTabGroupViewModel,
  SavedTabsTabGroupViewModel,
} from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'

const orderedCategories = (
  projection: Pick<
    SavedTabsCustomProjectDto | SavedTabsTabGroupDto,
    'collectionCategories'
  >,
) =>
  projection.collectionCategories.toSorted(
    (left, right) => left.sortOrder - right.sortOrder,
  )

export const toSavedTabsCustomProjectViewModel = (
  project: SavedTabsCustomProjectDto,
): SavedTabsCustomProjectViewModel => {
  const categories = orderedCategories(project)
  const categoryNameById = new Map(
    categories.map((category) => [category.id, category.name]),
  )
  return {
    categories: categories.map(({ name }) => name),
    categoryOrder: categories.map(({ name }) => name),
    createdAt: project.collection.createdAt,
    id: project.collection.id,
    memberships: project.memberships.map((membership) => {
      const category =
        membership.categoryId !== undefined
          ? categoryNameById.get(membership.categoryId)
          : undefined
      return {
        ...(category !== undefined ? { category } : {}),
        ...(membership.notes !== undefined ? { notes: membership.notes } : {}),
        urlId: membership.urlId,
      }
    }),
    name: project.collection.name,
    projectKeywords: {
      domainKeywords: [
        ...project.collection.definition.projectKeywords.domainKeywords,
      ],
      titleKeywords: [
        ...project.collection.definition.projectKeywords.titleKeywords,
      ],
      urlKeywords: [
        ...project.collection.definition.projectKeywords.urlKeywords,
      ],
    },
    updatedAt: project.collection.updatedAt,
  }
}

export const toSavedTabsTabGroupViewModel = (
  group: SavedTabsDisplayTabGroupDto,
): SavedTabsTabGroupViewModel => {
  const categories = orderedCategories(group)
  const categoryNameById = new Map(
    categories.map((category) => [category.id, category.name]),
  )
  return {
    categoryKeywords: categories.map((category) => ({
      categoryName: category.name,
      keywords: [...category.keywords],
    })),
    domain: group.collection.definition.domain,
    id: group.collection.id,
    memberships: group.memberships.map((membership) => {
      const category =
        membership.categoryId !== undefined
          ? categoryNameById.get(membership.categoryId)
          : undefined
      return {
        ...(category !== undefined ? { category } : {}),
        ...(membership.notes !== undefined ? { notes: membership.notes } : {}),
        urlId: membership.urlId,
      }
    }),
    ...(group.collection.groupId !== undefined
      ? { parentCategoryId: group.collection.groupId }
      : {}),
    savedAt: group.collection.createdAt,
    subCategories: categories.map(({ name }) => name),
    subCategoryOrder: categories.map(({ name }) => name),
    subCategoryOrderWithUncategorized: categories.map(({ name }) => name),
    ...(group.resolvedUrls !== undefined
      ? { urls: group.resolvedUrls.map((url) => ({ ...url })) }
      : {}),
  }
}

export const toSavedTabsDisplayTabGroupViewModel = (
  group: SavedTabsDisplayTabGroupDto,
): SavedTabsDisplayTabGroupViewModel => toSavedTabsTabGroupViewModel(group)

export const toTabGroupFromViewModel = (
  view: SavedTabsTabGroupViewModel,
): SavedTabsDisplayTabGroupDto => {
  const timestamp = view.savedAt ?? 0
  const categoryNames = [
    ...new Set(
      [
        ...(view.subCategoryOrder ?? []),
        ...(view.subCategories ?? []),
        ...(view.categoryKeywords?.map(({ categoryName }) => categoryName) ??
          []),
        ...(view.memberships?.flatMap(({ category }) =>
          category !== undefined ? [category] : [],
        ) ?? []),
        ...(view.urls?.flatMap(({ subCategory }) =>
          subCategory !== undefined ? [subCategory] : [],
        ) ?? []),
      ].filter(
        (name) =>
          name !== '' && name !== 'uncategorized' && name !== '__uncategorized',
      ),
    ),
  ]
  const categories = categoryNames.map((name, sortOrder) => ({
    collectionId: view.id,
    createdAt: timestamp,
    id: `${view.id}:category:${sortOrder}`,
    keywords:
      view.categoryKeywords?.find((entry) => entry.categoryName === name)
        ?.keywords ?? [],
    name,
    sortOrder,
    updatedAt: timestamp,
  }))
  const categoryIdByName = new Map(
    categories.map((category) => [category.name, category.id]),
  )
  const memberships =
    view.memberships ??
    view.urls?.flatMap(({ id }) => (id !== undefined ? [{ urlId: id }] : [])) ??
    []
  const group = createSavedTabsTabGroupDtoFromProjection({
    collection: {
      createdAt: timestamp,
      definition: { domain: view.domain, type: 'domain' },
      ...(view.parentCategoryId !== undefined
        ? { groupId: view.parentCategoryId }
        : {}),
      id: view.id,
      name: view.domain,
      sortOrder: 0,
      updatedAt: timestamp,
    },
    collectionCategories: categories,
    memberships: memberships.map((membership, sortOrder) => {
      const category =
        'category' in membership ? membership.category : undefined
      const categoryId =
        category !== undefined ? categoryIdByName.get(category) : undefined
      const notes = 'notes' in membership ? membership.notes : undefined
      return {
        addedAt: timestamp,
        ...(categoryId !== undefined ? { categoryId } : {}),
        collectionId: view.id,
        ...(notes !== undefined ? { notes } : {}),
        sortOrder,
        updatedAt: timestamp,
        urlId: membership.urlId,
      }
    }),
  })
  return {
    ...group,
    ...(view.urls !== undefined
      ? { resolvedUrls: view.urls.map((url) => ({ ...url })) }
      : {}),
  }
}

export const toCustomProjectFromViewModel = (
  view: SavedTabsCustomProjectViewModel,
): SavedTabsCustomProjectDto => {
  const categoryNames = view.categoryOrder ?? view.categories
  const categories = categoryNames.map((name, sortOrder) => ({
    collectionId: view.id,
    createdAt: view.createdAt,
    id: `${view.id}:category:${sortOrder}`,
    keywords: [],
    name,
    sortOrder,
    updatedAt: view.updatedAt,
  }))
  const categoryIdByName = new Map(
    categories.map((category) => [category.name, category.id]),
  )
  const memberships =
    view.memberships ??
    view.urls?.flatMap(({ id }) => (id !== undefined ? [{ urlId: id }] : [])) ??
    []
  return createSavedTabsCustomProjectDtoFromProjection({
    collection: {
      createdAt: view.createdAt,
      definition: {
        projectKeywords: view.projectKeywords ?? {
          domainKeywords: [],
          titleKeywords: [],
          urlKeywords: [],
        },
        type: 'custom',
      },
      id: view.id,
      name: view.name,
      sortOrder: 0,
      updatedAt: view.updatedAt,
    },
    collectionCategories: categories,
    memberships: memberships.map((membership, sortOrder) => {
      const category =
        'category' in membership ? membership.category : undefined
      const categoryId =
        category !== undefined ? categoryIdByName.get(category) : undefined
      const notes = 'notes' in membership ? membership.notes : undefined
      return {
        addedAt: view.createdAt,
        ...(categoryId !== undefined ? { categoryId } : {}),
        collectionId: view.id,
        ...(notes !== undefined ? { notes } : {}),
        sortOrder,
        updatedAt: view.updatedAt,
        urlId: membership.urlId,
      }
    }),
  })
}
