import type { SavedTabsCustomProjectDto } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { toSavedTabsCustomProjectDto } from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import type { ClockPort } from '@/contexts/saved-tabs/application/ports/ClockPort'
import type { CustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { createCustomProject } from '@/contexts/saved-tabs/domain/entities/CustomProject'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'

export type DeleteCustomProjectCommand = {
  readonly projectId: string
}

export type DeleteCustomProjectResult = {
  readonly all: readonly SavedTabsCustomProjectDto[]
}

export type DeleteCustomProjectUseCase = (
  command: DeleteCustomProjectCommand,
) => Promise<DeleteCustomProjectResult>

export type DeleteCustomProjectUseCaseDeps = {
  readonly clock: ClockPort
  readonly customProjectRepository: CustomProjectRepository
  readonly uncategorizedProjectId: string
}

const mergeIntoUncategorized = (
  target: CustomProject,
  uncategorized: CustomProject,
): CustomProject => {
  const existingUrlIds = new Set(
    uncategorized.memberships.map(({ urlId }) => urlId),
  )
  const memberships = uncategorized.memberships.map((membership) => ({
    ...membership,
  }))
  for (const membership of target.memberships) {
    if (existingUrlIds.has(membership.urlId)) {
      continue
    }
    existingUrlIds.add(membership.urlId)
    memberships.push({
      ...membership,
      collectionId: uncategorized.id,
      sortOrder: memberships.length,
    })
  }
  return createCustomProject({
    collection: {
      ...uncategorized.collection,
      updatedAt: Math.max(
        uncategorized.collection.updatedAt,
        target.collection.updatedAt,
      ),
    },
    collectionCategories: uncategorized.collectionCategories,
    memberships,
  })
}

export const createDeleteCustomProjectUseCase = (
  deps: DeleteCustomProjectUseCaseDeps,
): DeleteCustomProjectUseCase => {
  return async ({ projectId }) => {
    if (projectId === deps.uncategorizedProjectId) {
      throw new SavedTabsDomainError(
        'Uncategorized project cannot be deleted',
        'INVALID_CUSTOM_PROJECT',
      )
    }
    const all = await deps.customProjectRepository.findAll()
    const target = all.find((project) => project.id === projectId)
    if (!target) {
      throw new SavedTabsDomainError(
        `Project with ID ${projectId} not found`,
        'INVALID_CUSTOM_PROJECT',
      )
    }
    const existingUncategorized = all.find(
      (project) => project.id === deps.uncategorizedProjectId,
    )
    const timestamp = deps.clock.now()
    const uncategorized =
      existingUncategorized ??
      createCustomProject({
        collection: {
          createdAt: timestamp,
          definition: {
            projectKeywords: {
              domainKeywords: [],
              titleKeywords: [],
              urlKeywords: [],
            },
            type: 'custom',
          },
          id: deps.uncategorizedProjectId,
          name: '未分類',
          sortOrder: all.length,
          updatedAt: timestamp,
        },
        collectionCategories: [],
        memberships: [],
      })
    const merged = mergeIntoUncategorized(target, uncategorized)
    const remaining = [
      ...all.filter(
        (project) =>
          project.id !== projectId &&
          project.id !== deps.uncategorizedProjectId,
      ),
      merged,
    ]
    await deps.customProjectRepository.saveAll(remaining)
    return { all: remaining.map(toSavedTabsCustomProjectDto) }
  }
}
