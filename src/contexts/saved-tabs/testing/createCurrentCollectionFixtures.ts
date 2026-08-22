import { createCustomProject as createNormalizedCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { createTabGroup as createNormalizedTabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { TabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'

export type { CustomProject, TabGroup }

type LegacyTestMembership = {
  readonly category?: string
  readonly notes?: string
  readonly urlId: string
}

type TabGroupFixtureInput = {
  readonly categoryKeywords?: readonly {
    readonly categoryName: string
    readonly keywords: readonly string[]
  }[]
  readonly domain?: string
  readonly id: string
  readonly memberships?: readonly LegacyTestMembership[]
  readonly parentCategoryId?: string
  readonly savedAt?: number
  readonly subCategories?: readonly string[]
  readonly subCategoryOrder?: readonly string[]
  readonly subCategoryOrderWithUncategorized?: readonly string[]
}

type CustomProjectFixtureInput = {
  readonly categories?: readonly string[]
  readonly createdAt?: number
  readonly id: string
  readonly memberships?: readonly LegacyTestMembership[]
  readonly name?: string
  readonly updatedAt?: number
}

export const createTabGroup = (input: TabGroupFixtureInput): TabGroup => {
  const timestamp = input.savedAt ?? 0
  const categoryNames =
    input.subCategoryOrder ??
    input.subCategories ??
    input.categoryKeywords?.map(({ categoryName }) => categoryName) ??
    []
  const categories = categoryNames.map((name, index) => ({
    collectionId: input.id,
    createdAt: timestamp,
    id: `${input.id}:category:${index}`,
    keywords:
      input.categoryKeywords?.find((entry) => entry.categoryName === name)
        ?.keywords ?? [],
    name,
    sortOrder: index,
    updatedAt: timestamp,
  }))
  const categoryIdByName = new Map(
    categories.map((category) => [category.name, category.id]),
  )
  const domain = input.domain ?? input.id
  return createNormalizedTabGroup({
    collection: {
      createdAt: timestamp,
      definition: { domain, type: 'domain' },
      ...(input.parentCategoryId !== undefined
        ? { groupId: input.parentCategoryId }
        : {}),
      id: input.id,
      name: domain,
      sortOrder: 0,
      updatedAt: timestamp,
    },
    collectionCategories: categories,
    memberships: (input.memberships ?? []).map((membership, index) => {
      const categoryId =
        membership.category !== undefined
          ? categoryIdByName.get(membership.category)
          : undefined
      return {
        addedAt: timestamp,
        ...(categoryId !== undefined ? { categoryId } : {}),
        collectionId: input.id,
        ...(membership.notes !== undefined ? { notes: membership.notes } : {}),
        sortOrder: index,
        updatedAt: timestamp,
        urlId: membership.urlId,
      }
    }),
  })
}

export const createCustomProject = (
  input: CustomProjectFixtureInput,
): CustomProject => {
  const createdAt = input.createdAt ?? 0
  const updatedAt = input.updatedAt ?? createdAt
  const categories = (input.categories ?? []).map((name, index) => ({
    collectionId: input.id,
    createdAt,
    id: `${input.id}:category:${index}`,
    keywords: [],
    name,
    sortOrder: index,
    updatedAt,
  }))
  const categoryIdByName = new Map(
    categories.map((category) => [category.name, category.id]),
  )
  return createNormalizedCustomProject({
    collection: {
      createdAt,
      definition: {
        projectKeywords: {
          domainKeywords: [],
          titleKeywords: [],
          urlKeywords: [],
        },
        type: 'custom',
      },
      id: input.id,
      name: input.name ?? input.id,
      sortOrder: 0,
      updatedAt,
    },
    collectionCategories: categories,
    memberships: (input.memberships ?? []).map((membership, index) => {
      const categoryId =
        membership.category !== undefined
          ? categoryIdByName.get(membership.category)
          : undefined
      return {
        addedAt: createdAt,
        ...(categoryId !== undefined ? { categoryId } : {}),
        collectionId: input.id,
        ...(membership.notes !== undefined ? { notes: membership.notes } : {}),
        sortOrder: index,
        updatedAt,
        urlId: membership.urlId,
      }
    }),
  })
}
