import type { PrepareTabGroupDeletionCommand } from '@/contexts/saved-tabs/application/commands/PrepareTabGroupDeletionCommand'
import type { CategoriesCommandService } from '@/contexts/saved-tabs/application/ports/CategoriesCommandService'
import type { ParentCategory } from '@/contexts/saved-tabs/domain/entities/ParentCategory'
import type { DomainCategoryMappingRepository } from '@/contexts/saved-tabs/domain/repositories/DomainCategoryMappingRepository'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import { createDomainName } from '@/contexts/saved-tabs/domain/value-objects/DomainName'

/**
 * `PrepareTabGroupDeletionUseCase` が依存する repository / port 群。
 *
 * テスト時は in-memory mock を注入する。`chrome.storage.local` への
 * 依存を排除した unit test を書けるように、interface のみを公開する。
 */
export interface PrepareTabGroupDeletionUseCaseDeps {
  readonly tabGroupRepository: TabGroupRepository
  readonly parentCategoryRepository: ParentCategoryRepository
  readonly domainCategoryMappingRepository: DomainCategoryMappingRepository
  readonly categoriesCommandService: CategoriesCommandService
}

/**
 * `PrepareTabGroupDeletionUseCase` の関数型。
 *
 * presentation / controller hook 側は `use-case` を直接 import せず、
 * composition 層で生成した関数を受け取って呼び出す形を推奨。
 */
export type PrepareTabGroupDeletionUseCase = (
  command: PrepareTabGroupDeletionCommand,
) => Promise<void>

const ensureDomainNameInParentCategory = async (
  group: {
    readonly domain: string
    readonly parentCategoryId: string | undefined
  },
  parentCategoryRepository: ParentCategoryRepository,
): Promise<void> => {
  if (!group.parentCategoryId) {
    return
  }
  const fromRepo = await parentCategoryRepository.findAll()
  const parentCategory = fromRepo.find(
    (cat) => cat.id === group.parentCategoryId,
  )
  if (!parentCategory) {
    return
  }
  const domainName = createDomainName(group.domain)
  const hasDomainName = parentCategory.domainNames.includes(domainName)
  if (hasDomainName) {
    return
  }
  const updatedCategory: ParentCategory = {
    ...parentCategory,
    domainNames: [...parentCategory.domainNames, domainName],
  }
  await parentCategoryRepository.saveAll(
    fromRepo.map((cat) =>
      cat.id === group.parentCategoryId ? updatedCategory : cat,
    ),
  )
  console.log('ドメインを親カテゴリのdomainNamesに追加しました')
}

const updateDomainCategoryMappingIfNeeded = async (
  group: {
    readonly domain: string
    readonly parentCategoryId: string | undefined
  },
  domainCategoryMappingRepository: DomainCategoryMappingRepository,
): Promise<void> => {
  if (!group.parentCategoryId) {
    return
  }
  const currentMappings = await domainCategoryMappingRepository.findAll()
  const filtered = currentMappings.filter((m) => m.domain !== group.domain)
  await domainCategoryMappingRepository.saveAll([
    ...filtered,
    {
      categoryId: group.parentCategoryId,
      domain: group.domain,
    },
  ])
  console.log('ドメインのマッピングを更新しました')
}

/**
 * `PrepareTabGroupDeletionUseCase` を生成する。
 *
 * 責務 (issue #524):
 * 1. `tabGroupRepository.findRawTabGroupById` で対象 `TabGroup` の
 *    storage 形 (rich 補助フィールド付き) を取得する。
 *    見つからない / `domain` 未設定なら no-op。
 * 2. 3 つの副作用を `Promise.all` で並列に実行する:
 *    - `categoriesCommandService.updateDomainCategorySettings`
 *      で `DomainCategorySettings` を永続化
 *    - 親カテゴリの `domainNames` に `domain` を追加
 *    - `DomainCategoryMapping` を対象 `parentCategoryId` へ差し替え
 * 3. どこかで例外が出ても console.error でログだけ出して握りつぶす
 *    (旧 `tab-operations.handleTabGroupRemoval` の挙動を維持する
 *    ことで、削除前処理の失敗で削除本体が中断しないようにする)。
 *
 * 削除本体 (`TabGroup` / `UrlRecord` 削除と
 * `CustomProject` 側の URL 同期削除) は本 use-case の責務外。
 * `DeleteTabGroupUseCase` と `RemoveUrlsFromCustomProjectsUseCase`
 * に委譲する。
 */
export const createPrepareTabGroupDeletionUseCase = (
  deps: PrepareTabGroupDeletionUseCaseDeps,
): PrepareTabGroupDeletionUseCase => {
  return async (command) => {
    try {
      const groupToRemove = await deps.tabGroupRepository.findRawTabGroupById(
        command.tabGroupId,
      )
      if (!groupToRemove?.domain) {
        return
      }
      console.log('グループ削除前の処理を開始します')
      await Promise.all([
        deps.categoriesCommandService.updateDomainCategorySettings(
          groupToRemove.domain,
          [...groupToRemove.subCategories],
          groupToRemove.categoryKeywords.map((keyword) => ({
            categoryName: keyword.categoryName,
            keywords: [...keyword.keywords],
          })),
        ),
        ensureDomainNameInParentCategory(
          groupToRemove,
          deps.parentCategoryRepository,
        ),
        updateDomainCategoryMappingIfNeeded(
          groupToRemove,
          deps.domainCategoryMappingRepository,
        ),
      ])
    } catch (error) {
      console.error('タブグループ削除前処理エラー:', error)
    }
  }
}
