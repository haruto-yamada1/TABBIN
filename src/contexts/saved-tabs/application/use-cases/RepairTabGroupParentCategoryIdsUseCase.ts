import type { ParentCategory } from '../../domain/entities/ParentCategory'
import type { TabGroup } from '../../domain/entities/TabGroup'
import type { ParentCategoryRepository } from '../../domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '../../domain/repositories/TabGroupRepository'

/**
 * `RepairTabGroupParentCategoryIdsUseCase` の入力。
 *
 * `tabGroups` を省略した場合は `tabGroupRepository.findAll()` から取得し、
 * `parentCategories` を省略した場合は `parentCategoryRepository.findAll()`
 * から取得する。`useTabData` 内の初回ロードでは `GetSavedTabsPageDataQuery`
 * で取得した値をそのまま渡す運用を推奨。
 */
export interface RepairTabGroupParentCategoryIdsCommand {
  readonly tabGroups?: readonly TabGroup[]
  readonly parentCategories?: readonly ParentCategory[]
}

/**
 * `RepairTabGroupParentCategoryIdsUseCase` の出力。
 *
 * - `tabGroups` : `parentCategoryId` が補完された `TabGroup` 配列
 *   (修復不要なら元と同じ内容)。
 * - `updated` : 実際に永続化層の `savedTabs` を書き換えたかどうか。
 *   `false` のときは storage への副作用を発生させない。
 */
export interface RepairTabGroupParentCategoryIdsDto {
  readonly tabGroups: readonly TabGroup[]
  readonly updated: boolean
}

/**
 * `RepairTabGroupParentCategoryIdsUseCase` が依存する repository 群。
 */
export interface RepairTabGroupParentCategoryIdsUseCaseDeps {
  readonly tabGroupRepository: TabGroupRepository
  readonly parentCategoryRepository: ParentCategoryRepository
}

/**
 * `RepairTabGroupParentCategoryIdsUseCase` の関数型。
 */
export type RepairTabGroupParentCategoryIdsUseCase = (
  command?: RepairTabGroupParentCategoryIdsCommand,
) => Promise<RepairTabGroupParentCategoryIdsDto>

const buildCategoryLookups = (
  parentCategories: readonly ParentCategory[],
): {
  readonly byDomainId: ReadonlyMap<string, ParentCategory>
  readonly byDomainName: ReadonlyMap<string, ParentCategory>
} => {
  const byDomainId = new Map<string, ParentCategory>()
  const byDomainName = new Map<string, ParentCategory>()
  for (const category of parentCategories) {
    for (const domainId of category.domains ?? []) {
      byDomainId.set(domainId, category)
    }
    for (const domainName of category.domainNames ?? []) {
      byDomainName.set(domainName, category)
    }
  }
  return { byDomainId, byDomainName }
}

/**
 * `RepairTabGroupParentCategoryIdsUseCase` を生成する。
 *
 * 責務:
 * 1. 各 `TabGroup` を見て `parentCategoryId` が未設定なら、
 *    先に `category.domains` との一致（ID ベース）を試し、
 *    見つからなければ `category.domainNames` との一致（ドメイン名ベース）
 *    でフォールバックする。
 * 2. 修復が起きたときだけ `tabGroupRepository.saveAll` で永続化する。
 *
 * 旧 `useTabData.ts` の `repairSavedTabParentCategoryIds` を
 * application 層に移植した等価物 (issue #517)。
 *
 * @example
 * ```ts
 * const repair = createRepairTabGroupParentCategoryIdsUseCase({
 *   tabGroupRepository,
 *   parentCategoryRepository,
 * })
 * const { tabGroups, updated } = await repair({ tabGroups, parentCategories })
 * ```
 */
export const createRepairTabGroupParentCategoryIdsUseCase = (
  deps: RepairTabGroupParentCategoryIdsUseCaseDeps,
): RepairTabGroupParentCategoryIdsUseCase => {
  return async (command = {}) => {
    const [tabGroups, parentCategories] = await Promise.all([
      command.tabGroups !== undefined
        ? Promise.resolve(command.tabGroups)
        : deps.tabGroupRepository.findAll(),
      command.parentCategories !== undefined
        ? Promise.resolve(command.parentCategories)
        : deps.parentCategoryRepository.findAll(),
    ])

    const { byDomainId, byDomainName } = buildCategoryLookups(parentCategories)
    let needsUpdate = false
    const updatedTabGroups = tabGroups.map((group: TabGroup): TabGroup => {
      if (group.parentCategoryId) {
        return group
      }
      const categoryById = byDomainId.get(group.id)
      if (categoryById) {
        console.log(
          `TabGroupのparentCategoryIdを ${categoryById.id} に修復しました (IDベース)`,
        )
        needsUpdate = true
        return {
          ...group,
          parentCategoryId: categoryById.id,
        }
      }
      const categoryByName = byDomainName.get(group.domain)
      if (categoryByName) {
        console.log(
          `TabGroupのparentCategoryIdを ${categoryByName.id} に修復しました (ドメイン名ベース)`,
        )
        needsUpdate = true
        return {
          ...group,
          parentCategoryId: categoryByName.id,
        }
      }
      return group
    })

    if (needsUpdate) {
      await deps.tabGroupRepository.saveAll(updatedTabGroups)
      console.log('TabGroupのparentCategoryId修復処理が完了しました')
    }

    return {
      tabGroups: updatedTabGroups,
      updated: needsUpdate,
    }
  }
}
