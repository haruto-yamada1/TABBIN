import type { ResolvedCustomProjectUrlDto } from '@/contexts/saved-tabs/application/dto/ResolvedCustomProjectUrlDto'
import type { SavedTabsCustomProjectDto as CustomProject } from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { UrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
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

type ProjectUrlRecords = Map<string, UrlRecord>

const resolveProjectUrls = (
  project: CustomProject,
  recordsById: ProjectUrlRecords,
): ProjectUrlEntry[] => {
  const categoryNameById = new Map(
    project.collectionCategories.map((category) => [
      category.id,
      category.name,
    ]),
  )
  const orderedMemberships = project.memberships.toSorted(
    (left, right) => left.sortOrder - right.sortOrder,
  )
  const entries = orderedMemberships.map((membership) => {
    const record = recordsById.get(createUrlRecordId(membership.urlId))
    if (!record) {
      return null
    }
    const categoryId = membership.categoryId ?? ''
    const category =
      categoryId === '' ? undefined : categoryNameById.get(categoryId)
    const entry: ProjectUrlEntry = {
      ...(category !== undefined && category !== '' ? { category } : {}),
      ...(record.favIconUrl !== undefined && record.favIconUrl !== ''
        ? { favIconUrl: record.favIconUrl }
        : {}),
      ...(record.isFavorite !== undefined
        ? { isFavorite: record.isFavorite }
        : {}),
      id: record.id,
      ...(membership.notes !== undefined && membership.notes !== ''
        ? { notes: membership.notes }
        : {}),
      savedAt: record.savedAt,
      title: record.title,
      url: record.url,
    }
    return entry
  })
  return entries.flatMap((entry) => (entry ? [entry] : []))
}

const loadRecordsById = async (
  repository: UrlRecordRepository,
): Promise<ProjectUrlRecords> => {
  const records = await repository.findAll()
  return new Map(records.map((record) => [record.id, record]))
}

export const createGetProjectUrlsUseCase = (
  deps: GetProjectUrlsUseCaseDeps,
): GetProjectUrlsUseCase => {
  return async (project) => {
    if (project.memberships.length === 0) {
      return []
    }
    return resolveProjectUrls(
      project,
      await loadRecordsById(deps.urlRecordRepository),
    )
  }
}

export type GetProjectSearchUrlsUseCase = (
  projects: readonly CustomProject[],
) => Promise<ReadonlyMap<string, ProjectUrlEntry[]>>

// Resolve all memberships against the same read and URL record lookup.
export const createGetProjectSearchUrlsUseCase = (
  repository: UrlRecordRepository,
): GetProjectSearchUrlsUseCase => {
  return async (projects) => {
    const searchable = projects.filter(
      ({ memberships }) => memberships.length > 0,
    )
    if (searchable.length === 0) {
      return new Map()
    }
    const recordsById = await loadRecordsById(repository)
    return new Map(
      searchable.map((project) => [
        project.id,
        resolveProjectUrls(project, recordsById),
      ]),
    )
  }
}
