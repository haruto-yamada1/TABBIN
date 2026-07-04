import type { MoveDomainToCategoryCommand } from '@/contexts/saved-tabs/application/commands/MoveDomainToCategoryCommand'
import type { CategorySyncDto } from '@/contexts/saved-tabs/application/dto/CategorySyncDto'
import { parentCategoryContainsDomainName } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type { ParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type { TabGroup } from '@/contexts/saved-tabs/domain/entities/TabGroup'
import { SavedTabsDomainError } from '@/contexts/saved-tabs/domain/errors/SavedTabsDomainError'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import {
  buildCategoryLookup,
  resolveCategoryForTabGroup,
} from '@/contexts/saved-tabs/domain/services/CategoryAssignmentPolicy'
import {
  createDomainName,
  normalizeDomainString,
} from '@/contexts/saved-tabs/domain/value-objects/DomainName'
import { createParentCategoryId } from '@/contexts/saved-tabs/domain/value-objects/ParentCategoryId'

/**
 * `SyncCategoryAssignmentsUseCase` の入力。
 *
 * `MoveDomainToCategoryCommand` 由来の個別操作と、
 * 「全 TabGroup を再判定するバルク同期」を 1 つの use-case にまとめる。
 * `command` が指定された場合はそのドメインのみを処理し、
 * 未指定なら全 TabGroup を再判定する。
 */
export interface SyncCategoryAssignmentsCommand {
  readonly command?: MoveDomainToCategoryCommand
}

/**
 * `SyncCategoryAssignmentsUseCase` が依存する repository 群。
 */
export interface SyncCategoryAssignmentsUseCaseDeps {
  readonly tabGroupRepository: TabGroupRepository
  readonly parentCategoryRepository: ParentCategoryRepository
}

/**
 * `SyncCategoryAssignmentsUseCase` の関数型。
 */
export type SyncCategoryAssignmentsUseCase = (
  command: SyncCategoryAssignmentsCommand,
) => Promise<CategorySyncDto>

const syncSingleDomain = async (
  deps: SyncCategoryAssignmentsUseCaseDeps,
  moveCommand: MoveDomainToCategoryCommand,
): Promise<{
  assignedTabGroupIds: TabGroup['id'][]
  unassignedTabGroupIds: TabGroup['id'][]
  updatedCategoryIds: ParentCategory['id'][]
}> => {
  const targetDomainName = createDomainName(
    normalizeDomainString(moveCommand.domain),
  )
  const targetCategoryId = createParentCategoryId(moveCommand.parentCategoryId)
  const [allTabGroups, allCategories] = await Promise.all([
    deps.tabGroupRepository.findAll(),
    deps.parentCategoryRepository.findAll(),
  ])

  const targetCategory = allCategories.find(
    (category) => category.id === targetCategoryId,
  )
  if (!targetCategory) {
    throw new SavedTabsDomainError(
      '指定された ParentCategory が見つかりません',
      'PARENT_CATEGORY_NOT_FOUND',
    )
  }

  const updatedCategoryIds: ParentCategory['id'][] = []
  const nextCategory = parentCategoryContainsDomainName(
    targetCategory,
    targetDomainName,
  )
    ? targetCategory
    : ({
        ...targetCategory,
        domainNames: [...targetCategory.domainNames, targetDomainName],
      } satisfies ParentCategory)
  if (nextCategory !== targetCategory) {
    updatedCategoryIds.push(targetCategory.id)
  }

  const assignedTabGroupIds: TabGroup['id'][] = []
  const unassignedTabGroupIds: TabGroup['id'][] = []
  const updatedTabGroups = allTabGroups.map((group) => {
    if (group.domain !== targetDomainName) {
      return group
    }
    if (group.parentCategoryId === targetCategory.id) {
      return group
    }
    // 他のカテゴリからの付け替えは「assigned」にだけ数え、未分類への
    // 退避 (unassigned) とは区別する。
    assignedTabGroupIds.push(group.id)
    return { ...group, parentCategoryId: targetCategory.id }
  })

  const previousCategoryIdsWithThisDomain = allCategories.filter((category) =>
    parentCategoryContainsDomainName(category, targetDomainName),
  )

  const nextCategories: readonly ParentCategory[] = (() => {
    if (
      previousCategoryIdsWithThisDomain.some(
        (category) => category.id !== targetCategory.id,
      )
    ) {
      return allCategories.map((category) => {
        if (category.id === targetCategory.id) {
          return nextCategory
        }
        if (!parentCategoryContainsDomainName(category, targetDomainName)) {
          return category
        }
        const filteredDomainNames = category.domainNames.filter(
          (name) => name !== targetDomainName,
        )
        updatedCategoryIds.push(category.id)
        return { ...category, domainNames: filteredDomainNames }
      })
    }
    if (nextCategory !== targetCategory) {
      return allCategories.map((category) =>
        category.id === targetCategory.id ? nextCategory : category,
      )
    }
    return allCategories
  })()

  if (
    updatedTabGroups.length !== allTabGroups.length ||
    updatedTabGroups.some((group, i) => group !== allTabGroups[i])
  ) {
    await deps.tabGroupRepository.saveAll(updatedTabGroups)
  }
  if (nextCategories !== allCategories) {
    await deps.parentCategoryRepository.saveAll(nextCategories)
  }

  return {
    assignedTabGroupIds,
    unassignedTabGroupIds,
    updatedCategoryIds: Array.from(new Set(updatedCategoryIds)),
  }
}

const syncAll = async (
  deps: SyncCategoryAssignmentsUseCaseDeps,
): Promise<{
  assignedTabGroupIds: TabGroup['id'][]
  unassignedTabGroupIds: TabGroup['id'][]
  updatedCategoryIds: ParentCategory['id'][]
}> => {
  const [allTabGroups, allCategories] = await Promise.all([
    deps.tabGroupRepository.findAll(),
    deps.parentCategoryRepository.findAll(),
  ])
  const lookup = buildCategoryLookup(allCategories)
  const assignedTabGroupIds: TabGroup['id'][] = []
  const unassignedTabGroupIds: TabGroup['id'][] = []
  const updatedCategoryIds = new Set<ParentCategory['id']>()

  const updatedTabGroups = allTabGroups.map((group) => {
    const category = resolveCategoryForTabGroup(group, lookup)
    if (!category) {
      if (group.parentCategoryId !== undefined) {
        unassignedTabGroupIds.push(group.id)
        return { ...group, parentCategoryId: undefined }
      }
      return group
    }
    if (group.parentCategoryId === category.id) {
      if (
        !category.domainNames.includes(group.domain) &&
        !category.domains.includes(group.id)
      ) {
        updatedCategoryIds.add(category.id)
      }
      return group
    }
    if (group.parentCategoryId !== undefined) {
      unassignedTabGroupIds.push(group.id)
    }
    assignedTabGroupIds.push(group.id)
    // 新規 / 付け替えで親カテゴリが変わる場合も、カテゴリ側の
    // `domainNames` を member groups から再計算するため、
    // updatedCategoryIds に追加して saveAll 対象にする。
    updatedCategoryIds.add(category.id)
    return { ...group, parentCategoryId: category.id }
  })

  const updatedCategories = allCategories.map((category) => {
    if (!updatedCategoryIds.has(category.id)) {
      return category
    }
    const memberGroups = updatedTabGroups.filter(
      (group) => group.parentCategoryId === category.id,
    )
    const memberDomainNames = Array.from(
      new Set(memberGroups.map((group) => group.domain)),
    )
    const memberDomainIds = Array.from(
      new Set(memberGroups.map((group) => group.id)),
    )
    return {
      ...category,
      domainNames: memberDomainNames,
      domains: memberDomainIds,
    }
  })

  if (
    updatedTabGroups.length !== allTabGroups.length ||
    updatedTabGroups.some((group, i) => group !== allTabGroups[i])
  ) {
    await deps.tabGroupRepository.saveAll(updatedTabGroups)
  }
  if (
    updatedCategories.length !== allCategories.length ||
    updatedCategories.some((category, i) => category !== allCategories[i])
  ) {
    await deps.parentCategoryRepository.saveAll(updatedCategories)
  }

  return {
    assignedTabGroupIds,
    unassignedTabGroupIds,
    updatedCategoryIds: Array.from(updatedCategoryIds),
  }
}

/**
 * `SyncCategoryAssignmentsUseCase` を生成する。
 *
 * 責務:
 * - `command` が指定された場合: 単一ドメインのカテゴリ再割り当て
 * - `command` 未指定: 全 TabGroup を対象に再判定
 *
 * 既存の `SavedTabsApp.tsx` の `assignCategoryToGroup` / 関連ロジックを
 * domain サービスの `resolveCategoryForTabGroup` /
 * `buildCategoryLookup` に置き換える。副作用は repository のみ。
 */
export const createSyncCategoryAssignmentsUseCase = (
  deps: SyncCategoryAssignmentsUseCaseDeps,
): SyncCategoryAssignmentsUseCase => {
  return async (command) => {
    const result = command.command
      ? await syncSingleDomain(deps, command.command)
      : await syncAll(deps)
    return {
      assignedTabGroupIds: result.assignedTabGroupIds,
      unassignedTabGroupIds: result.unassignedTabGroupIds,
      updatedCategoryIds: result.updatedCategoryIds,
    }
  }
}
