import type { RemoveUrlsFromCustomProjectCommand } from '@/contexts/saved-tabs/application/commands/RemoveUrlsFromCustomProjectCommand'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import type { CustomProjectRepository } from '@/contexts/saved-tabs/domain/repositories/CustomProjectRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import type { UrlRecordRepository } from '@/contexts/saved-tabs/domain/repositories/UrlRecordRepository'

export type CustomProjectUrlDeletionServiceDeps = {
  readonly customProjectRepository: CustomProjectRepository
  readonly tabGroupRepository: TabGroupRepository
  readonly urlRecordRepository: UrlRecordRepository
}

/** Delete saved URLs, rather than just unlinking their custom memberships. */
export const deleteCustomProjectUrls = async (
  deps: CustomProjectUrlDeletionServiceDeps,
  { projectId, urls }: RemoveUrlsFromCustomProjectCommand,
): Promise<void> => {
  if (urls.length === 0) {
    return
  }

  const [projects, groups, records] = await Promise.all([
    deps.customProjectRepository.findAll(),
    deps.tabGroupRepository.findAll(),
    deps.urlRecordRepository.findAll(),
  ])
  const source = projects.find(({ id }) => id === projectId)
  if (!source) {
    throw new SavedTabsDomainError(
      '削除対象の CustomProject が見つかりません',
      'INVALID_CUSTOM_PROJECT',
    )
  }
  // Only this project's members authorize deletion; stale selections are no-op.
  const selectedUrls = new Set(urls)
  const sourceIds = new Set(source.memberships.map(({ urlId }) => urlId))
  const selectedIds = new Set(
    records
      .filter(({ id, url }) => sourceIds.has(id) && selectedUrls.has(url))
      .map(({ id }) => id),
  )
  if (selectedIds.size === 0) {
    return
  }

  const updatedGroups = groups.flatMap((group) => {
    const memberships = group.memberships.filter(
      ({ urlId }) => !selectedIds.has(urlId),
    )
    if (memberships.length === group.memberships.length) {
      return [group]
    }
    return memberships.length > 0 ? [{ ...group, memberships }] : []
  })
  const updatedProjects = projects.map((project) => {
    const memberships = project.memberships.filter(
      ({ urlId }) => !selectedIds.has(urlId),
    )
    return memberships.length === project.memberships.length
      ? project
      : { ...project, memberships }
  })

  // Native composition commits these repository changes in one transaction.
  // Moving URLs between projects continues to use the separate unlink command.
  if (
    updatedGroups.length !== groups.length ||
    updatedGroups.some((group, index) => group !== groups[index])
  ) {
    await deps.tabGroupRepository.saveAll(updatedGroups)
  }
  await deps.customProjectRepository.saveAll(updatedProjects)
  await deps.urlRecordRepository.removeByIds([...selectedIds])
}
