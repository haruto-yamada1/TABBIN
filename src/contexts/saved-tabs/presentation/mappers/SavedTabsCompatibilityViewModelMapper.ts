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
    memberships: project.memberships.map((membership) => ({
      ...(membership.categoryId
        ? { category: categoryNameById.get(membership.categoryId) }
        : {}),
      ...(membership.notes ? { notes: membership.notes } : {}),
      urlId: membership.urlId,
    })),
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
    memberships: group.memberships.map((membership) => ({
      ...(membership.categoryId
        ? { category: categoryNameById.get(membership.categoryId) }
        : {}),
      ...(membership.notes ? { notes: membership.notes } : {}),
      urlId: membership.urlId,
    })),
    ...(group.collection.groupId
      ? { parentCategoryId: group.collection.groupId }
      : {}),
    savedAt: group.collection.createdAt,
    subCategories: categories.map(({ name }) => name),
    subCategoryOrder: categories.map(({ name }) => name),
    subCategoryOrderWithUncategorized: categories.map(({ name }) => name),
    ...(group.resolvedUrls
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
          category ? [category] : [],
        ) ?? []),
        ...(view.urls?.flatMap(({ subCategory }) =>
          subCategory ? [subCategory] : [],
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
    view.urls?.flatMap(({ id }) => (id ? [{ urlId: id }] : [])) ??
    []
  const group = createSavedTabsTabGroupDtoFromProjection({
    collection: {
      createdAt: timestamp,
      definition: { domain: view.domain, type: 'domain' },
      ...(view.parentCategoryId ? { groupId: view.parentCategoryId } : {}),
      id: view.id,
      name: view.domain,
      sortOrder: 0,
      updatedAt: timestamp,
    },
    collectionCategories: categories,
    memberships: memberships.map((membership, sortOrder) => ({
      addedAt: timestamp,
      ...('category' in membership && membership.category
        ? { categoryId: categoryIdByName.get(membership.category) }
        : {}),
      collectionId: view.id,
      ...('notes' in membership && membership.notes
        ? { notes: membership.notes }
        : {}),
      sortOrder,
      updatedAt: timestamp,
      urlId: membership.urlId,
    })),
  })
  return {
    ...group,
    ...(view.urls
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
    view.urls?.flatMap(({ id }) => (id ? [{ urlId: id }] : [])) ??
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
    memberships: memberships.map((membership, sortOrder) => ({
      addedAt: view.createdAt,
      ...('category' in membership && membership.category
        ? { categoryId: categoryIdByName.get(membership.category) }
        : {}),
      collectionId: view.id,
      ...('notes' in membership && membership.notes
        ? { notes: membership.notes }
        : {}),
      sortOrder,
      updatedAt: view.updatedAt,
      urlId: membership.urlId,
    })),
  })
}
