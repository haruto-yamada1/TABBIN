import { v4 as uuidv4 } from 'uuid'

import { getRequiredPersistenceStorageLocal } from '@/app/composition/persistenceStorageLocal'
import type {
  DomainCategorySettings,
  DomainParentCategoryMapping,
  ParentCategory,
  SubCategoryKeyword,
} from '@/types/storage'
import { domainMatches, hasNormalizedDomain } from '@/utils/domain-normalize'

// 親カテゴリを取得する関数
export const getParentCategories = async (): Promise<ParentCategory[]> => {
  const { parentCategories = [] } =
    await getRequiredPersistenceStorageLocal().get<{
      parentCategories?: ParentCategory[]
    }>('parentCategories')
  return parentCategories
} // 親カテゴリを保存する関数
export const saveParentCategories = async (
  categories: ParentCategory[],
): Promise<void> => {
  await getRequiredPersistenceStorageLocal().set({
    parentCategories: categories,
  })
} // 新しい親カテゴリを作成する関数
export const createParentCategory = async (
  name: string,
): Promise<ParentCategory> => {
  const categories = await getParentCategories()

  // 重複チェック: 同じ名前のカテゴリが既に存在するかを確認
  const duplicateCategory = categories.find(
    (category) => category.name.toLowerCase() === name.toLowerCase(),
  )
  if (duplicateCategory) {
    throw new Error(`DUPLICATE_CATEGORY_NAME:${name}`)
  }
  const newCategory: ParentCategory = {
    domainNames: [], // 空の配列で初期化
    domains: [],
    id: uuidv4(),
    name,
  }
  await saveParentCategories([...categories, newCategory])
  return newCategory
} // ドメイン名でカテゴリを検索する関数を追加
export const findCategoryByDomainName = async (
  domainName: string,
): Promise<ParentCategory | null> => {
  const categories = await getParentCategories()
  return (
    categories.find((category) =>
      hasNormalizedDomain(category.domainNames, domainName),
    ) ?? null
  )
} // ドメインのカテゴリ設定を取得する関数
export const getDomainCategorySettings = async (): Promise<
  DomainCategorySettings[]
> => {
  const { domainCategorySettings = [] } =
    await getRequiredPersistenceStorageLocal().get<{
      domainCategorySettings?: DomainCategorySettings[]
    }>('domainCategorySettings')
  return domainCategorySettings
} // ドメインのカテゴリ設定を保存する関数
export const saveDomainCategorySettings = async (
  settings: DomainCategorySettings[],
): Promise<void> => {
  await getRequiredPersistenceStorageLocal().set({
    domainCategorySettings: settings,
  })
} // ドメインのカテゴリ設定を更新する関数
export const updateDomainCategorySettings = async (
  domain: string,
  subCategories: string[],
  categoryKeywords: SubCategoryKeyword[],
): Promise<void> => {
  const settings = await getDomainCategorySettings()

  // 既存の設定を探す (ストレージ形式のスキーム付き/hostname 混在を吸収)
  const existingIndex = settings.findIndex((s) =>
    domainMatches(s.domain, domain),
  )
  if (existingIndex !== -1) {
    // 既存の設定を更新
    settings[existingIndex] = {
      categoryKeywords,
      domain,
      subCategories,
    }
  } else {
    // 新しい設定を追加
    settings.push({
      categoryKeywords,
      domain,
      subCategories,
    })
  }
  await saveDomainCategorySettings(settings)
} // ドメイン-親カテゴリのマッピングを取得する関数
export const getDomainCategoryMappings = async (): Promise<
  DomainParentCategoryMapping[]
> => {
  const { domainCategoryMappings = [] } =
    await getRequiredPersistenceStorageLocal().get<{
      domainCategoryMappings?: DomainParentCategoryMapping[]
    }>('domainCategoryMappings')
  return domainCategoryMappings
} // ドメイン-親カテゴリのマッピングを保存する関数
export const saveDomainCategoryMappings = async (
  mappings: DomainParentCategoryMapping[],
): Promise<void> => {
  await getRequiredPersistenceStorageLocal().set({
    domainCategoryMappings: mappings,
  })
} // ドメイン-親カテゴリのマッピングを更新する関数
export const updateDomainCategoryMapping = async (
  domain: string,
  categoryId: string | null,
): Promise<void> => {
  const mappings = await getDomainCategoryMappings()

  // 既存のマッピングを探す (ストレージ形式のスキーム付き/hostname 混在を吸収)
  const existingIndex = mappings.findIndex((m) =>
    domainMatches(m.domain, domain),
  )
  if (categoryId === null) {
    // カテゴリIDがnullの場合は、マッピングを削除
    if (existingIndex !== -1) {
      mappings.splice(existingIndex, 1)
      await saveDomainCategoryMappings(mappings)
    }
    return
  }
  if (existingIndex !== -1) {
    // 既存のマッピングを更新。触ったレコードの domain を現在の (hostname) 値で
    // 上書きし、legacy スキーム付き形式を漸進的に解消する
    // (updateDomainCategorySettings と同じ挙動) (CodeRabbit PR #626 review)。
    mappings[existingIndex] = { categoryId, domain }
  } else {
    // 新しいマッピングを追加
    mappings.push({
      categoryId,
      domain,
    })
  }
  await saveDomainCategoryMappings(mappings)
} // 親カテゴリを削除する関数
export const deleteParentCategory = async (
  categoryId: string,
): Promise<void> => {
  try {
    // 現在のカテゴリリストを取得
    const categories = await getParentCategories()

    // 削除するカテゴリを見つける
    const categoryToDelete = categories.find((cat) => cat.id === categoryId)
    if (!categoryToDelete) {
      throw new Error(`カテゴリID ${categoryId} が見つかりません`)
    }

    // このカテゴリに属しているドメイン名のリスト
    const categoryWithOptionalDomains: Partial<ParentCategory> =
      categoryToDelete
    const affectedDomainNames = categoryWithOptionalDomains.domainNames ?? []

    // カテゴリを除外したリストを作成
    const updatedCategories = categories.filter((cat) => cat.id !== categoryId)

    // カテゴリリストを更新
    await saveParentCategories(updatedCategories)

    // このカテゴリに関連付けられていたすべてのドメインのマッピングを削除
    const mappings = await getDomainCategoryMappings()
    const updatedMappings = mappings.filter(
      (mapping) => mapping.categoryId !== categoryId,
    )

    // マッピングを更新
    await saveDomainCategoryMappings(updatedMappings)
    console.log(
      `親カテゴリ「${categoryToDelete.name}」を削除しました。影響を受けたドメイン: ${affectedDomainNames.join(', ')}`,
    )
    // eslint-disable-next-line eslint/no-useless-return
    return
  } catch (error) {
    console.error('親カテゴリの削除に失敗しました:', error)
    throw error
  }
}
