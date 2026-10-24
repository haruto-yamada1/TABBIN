import type { DeleteSelectedSavedUrlsCommand } from '@/contexts/saved-tabs/application/commands/DeleteSelectedSavedUrlsCommand'
import type { DeletedSelectedSavedUrlsDto } from '@/contexts/saved-tabs/application/dto/DeletedSelectedSavedUrlsDto'
import {
  toSavedTabsCustomProjectDto,
  toSavedTabsParentCategoryDto,
  toSavedTabsTabGroupDto,
  toSavedTabsUrlRecordDto,
} from '@/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper'
import type { TabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import type { UrlRecord } from '@/contexts/saved-tabs/domain/entities/UrlRecord'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import { collectReferencedUrlRecordIds } from '@/contexts/saved-tabs/domain/services/UrlReferenceService'
import type { UrlRecordId } from '@/contexts/saved-tabs/domain/value-objects/UrlRecordId'

import type { BuildSavedTabsSnapshotUseCaseDeps } from './BuildSavedTabsSnapshotUseCase'

export type DeleteSelectedSavedUrlsUseCaseDeps =
  BuildSavedTabsSnapshotUseCaseDeps

export type DeleteSelectedSavedUrlsUseCase = (
  command: DeleteSelectedSavedUrlsCommand,
) => Promise<DeletedSelectedSavedUrlsDto>

const groupSelectedUrls = (
  targets: DeleteSelectedSavedUrlsCommand['targets'],
): ReadonlyMap<string, ReadonlySet<string>> => {
  const urlsByGroup = new Map<string, Set<string>>()
  for (const { tabGroupId, urls } of targets) {
    for (const url of urls) {
      const selected = urlsByGroup.get(tabGroupId) ?? new Set<string>()
      selected.add(url)
      urlsByGroup.set(tabGroupId, selected)
    }
  }
  return urlsByGroup
}

const validateSelectedMemberships = (
  urlsByGroup: ReadonlyMap<string, ReadonlySet<string>>,
  groups: readonly TabGroup[],
  records: readonly UrlRecord[],
) => {
  const groupById = new Map(groups.map((group) => [String(group.id), group]))
  const recordByUrl = new Map<string, UrlRecord>(
    records.map((record) => [record.url, record]),
  )
  const selectedByGroup = new Map<string, ReadonlySet<UrlRecordId>>()
  const selectedUrlIds = new Set<UrlRecordId>()
  let removedCount = 0
  for (const [tabGroupId, urls] of urlsByGroup) {
    const group = groupById.get(tabGroupId)
    if (!group) {
      throw new SavedTabsDomainError(
        '削除対象の TabGroup が見つかりません',
        'TAB_GROUP_NOT_FOUND',
      )
    }
    const membershipIds = new Set(group.memberships.map(({ urlId }) => urlId))
    const selected = new Set<UrlRecordId>()
    for (const url of urls) {
      const record = recordByUrl.get(url)
      if (!record || !membershipIds.has(record.id)) {
        throw new SavedTabsDomainError(
          '選択した URL が対象の TabGroup に見つかりません',
          'URL_RECORD_NOT_FOUND',
        )
      }
      selected.add(record.id)
      selectedUrlIds.add(record.id)
    }
    selectedByGroup.set(tabGroupId, selected)
    removedCount += selected.size
  }
  return { removedCount, selectedByGroup, selectedUrlIds }
}

/** The native composition runs this entire selection in one revision-checked commit. */
export const createDeleteSelectedSavedUrlsUseCase =
  (deps: DeleteSelectedSavedUrlsUseCaseDeps): DeleteSelectedSavedUrlsUseCase =>
  async ({ targets }) => {
    const urlsByGroup = groupSelectedUrls(targets)
    if (urlsByGroup.size === 0) {
      return { removedCount: 0, snapshot: null }
    }

    const [groups, records, projects, customProjectOrder, parentCategories] =
      await Promise.all([
        deps.tabGroupRepository.findAll(),
        deps.urlRecordRepository.findAll(),
        deps.customProjectRepository.findAll(),
        deps.customProjectRepository.findOrder(),
        deps.parentCategoryRepository.findAll(),
      ])
    // Validate every target before calling an operation that can mutate state.
    const { removedCount, selectedByGroup, selectedUrlIds } =
      validateSelectedMemberships(urlsByGroup, groups, records)
    const updatedGroups = groups.flatMap((group) => {
      const selected = selectedByGroup.get(group.id)
      if (!selected) {
        return [group]
      }
      const memberships = group.memberships.filter(
        ({ urlId }) => !selected.has(urlId),
      )
      return memberships.length > 0 ? [{ ...group, memberships }] : []
    })
    const updatedProjects = projects.map((project) => {
      const memberships = project.memberships.filter(
        ({ urlId }) => !selectedUrlIds.has(urlId),
      )
      return memberships.length === project.memberships.length
        ? project
        : { ...project, memberships }
    })
    const referenced = collectReferencedUrlRecordIds({
      tabGroups: updatedGroups,
      customProjects: updatedProjects,
    })
    const unreferencedIds = [...selectedUrlIds].filter(
      (id) => !referenced.has(id),
    )
    const snapshot = {
      customProjectOrder: customProjectOrder.map(String),
      customProjects: projects.map(toSavedTabsCustomProjectDto),
      parentCategories: parentCategories.map(toSavedTabsParentCategoryDto),
      savedTabs: groups.map(toSavedTabsTabGroupDto),
      urlRecords: records.map(toSavedTabsUrlRecordDto),
    }

    await deps.tabGroupRepository.saveAll(updatedGroups)
    if (updatedProjects.some((project, index) => project !== projects[index])) {
      await deps.customProjectRepository.saveAll(updatedProjects)
    }
    if (unreferencedIds.length > 0) {
      await deps.urlRecordRepository.removeByIds(unreferencedIds)
    }
    return { removedCount, snapshot }
  }
