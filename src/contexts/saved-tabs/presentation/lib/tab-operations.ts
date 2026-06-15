import type { CategoriesCommandService } from '@/contexts/saved-tabs/application/ports/CategoriesCommandService'
import type { DomainCategoryMappingRepository } from '@/contexts/saved-tabs/domain/repositories/DomainCategoryMappingRepository'
import type { ParentCategoryRepository } from '@/contexts/saved-tabs/domain/repositories/ParentCategoryRepository'
import type { TabGroupRepository } from '@/contexts/saved-tabs/domain/repositories/TabGroupRepository'
import type { TabGroup } from '@/types/storage'

const ensureDomainNameInParentCategory = async (
  groupToRemove: TabGroup,
  parentCategoryRepository: ParentCategoryRepository,
): Promise<void> => {
  if (!groupToRemove.parentCategoryId) {
    return
  }
  const fromRepo =
    // domain entity (branded id) を storage shape へ投影
    // eslint-disable-next-line typescript/no-unsafe-type-assertion
    (await parentCategoryRepository.findAll()) as unknown as readonly {
      id: string
      domains: string[]
      domainNames: string[]
      name: string
    }[]
  const parentCategory = fromRepo.find(
    (cat) => cat.id === groupToRemove.parentCategoryId,
  )
  if (!parentCategory) {
    return
  }
  const hasDomainName = parentCategory.domainNames?.includes(
    groupToRemove.domain,
  )
  if (hasDomainName) {
    return
  }
  const updatedCategory = {
    ...parentCategory,
    domainNames: [...(parentCategory.domainNames || []), groupToRemove.domain],
  }
  await parentCategoryRepository.saveAll(
    // eslint-disable-next-line typescript/no-unsafe-type-assertion
    fromRepo.map((cat) =>
      cat.id === groupToRemove.parentCategoryId ? updatedCategory : cat,
    ) as unknown as Parameters<typeof parentCategoryRepository.saveAll>[0],
  )
  console.log(
    `ドメイン ${groupToRemove.domain} を親カテゴリのdomainNamesに追加しました`,
  )
}
const updateDomainCategoryMappingIfNeeded = async (
  groupToRemove: TabGroup,
  domainCategoryMappingRepository: DomainCategoryMappingRepository,
): Promise<void> => {
  if (!groupToRemove.parentCategoryId) {
    return
  }
  const currentMappings = await domainCategoryMappingRepository.findAll()
  const filtered = currentMappings.filter(
    (m) => m.domain !== groupToRemove.domain,
  )
  await domainCategoryMappingRepository.saveAll([
    ...filtered,
    {
      categoryId: groupToRemove.parentCategoryId,
      domain: groupToRemove.domain,
    },
  ])
  console.log(`ドメイン ${groupToRemove.domain} のマッピングを更新しました`)
}

export interface TabOperationsDeps {
  readonly tabGroupRepository: TabGroupRepository
  readonly parentCategoryRepository: ParentCategoryRepository
  readonly domainCategoryMappingRepository: DomainCategoryMappingRepository
  readonly categoriesCommandService: CategoriesCommandService
}

/**
 * タブグループ削除前の処理関数
 * グループのカテゴリ設定を保存します
 *
 * @param groupId 削除対象のグループID
 */
export const handleTabGroupRemoval = async (
  groupId: string,
  deps: TabOperationsDeps,
): Promise<void> => {
  try {
    const fromRepo =
      // domain entity (branded id) を storage shape へ投影
      // eslint-disable-next-line typescript/no-unsafe-type-assertion
      (await deps.tabGroupRepository.findAll()) as unknown as TabGroup[]
    const groupToRemove = fromRepo.find((group) => group.id === groupId)
    if (!groupToRemove?.domain) {
      return
    }
    console.log(`グループ削除前の処理: ${groupToRemove.domain}`)
    await Promise.all([
      deps.categoriesCommandService.updateDomainCategorySettings(
        groupToRemove.domain,
        groupToRemove.subCategories ?? [],
        groupToRemove.categoryKeywords ?? [],
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
