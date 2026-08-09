import type { ResolvedCustomProjectUrlDto } from '@/contexts/saved-tabs/application/dto/ResolvedCustomProjectUrlDto'
import type { SavedTabsCustomProjectDto as CustomProject } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'
import { createUrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'

export type ProjectUrlEntry = ResolvedCustomProjectUrlDto

export type GetProjectUrlsUseCase = (
  project: CustomProject,
) => Promise<ProjectUrlEntry[]>

export type GetProjectUrlsUseCaseDeps = {
  /** Retained while legacy composition converges; current reads use the input projection. */
  readonly customProjectRepository: CustomProjectRepository
  readonly urlRecordRepository: UrlRecordRepository
}

export const createGetProjectUrlsUseCase = (
  deps: GetProjectUrlsUseCaseDeps,
): GetProjectUrlsUseCase => {
  return async (project) => {
    const categoryNameById = new Map(
      project.collectionCategories.map((category) => [
        category.id,
        category.name,
      ]),
    )
    const orderedMemberships = project.memberships.toSorted(
      (left, right) => left.sortOrder - right.sortOrder,
    )
    const entries = await Promise.all(
      orderedMemberships.map(async (membership) => {
        const record = await deps.urlRecordRepository.findById(
          createUrlRecordId(membership.urlId),
        )
        if (!record) {
          return null
        }
        const category = membership.categoryId
          ? categoryNameById.get(membership.categoryId)
          : undefined
        const entry: ProjectUrlEntry = {
          ...(category ? { category } : {}),
          ...(record.favIconUrl ? { favIconUrl: record.favIconUrl } : {}),
          id: record.id,
          ...(membership.notes ? { notes: membership.notes } : {}),
          savedAt: record.savedAt,
          title: record.title,
          url: record.url,
        }
        return entry
      }),
    )
    return entries.flatMap((entry) => (entry ? [entry] : []))
  }
}
