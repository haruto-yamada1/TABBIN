/**
 * @file useTabData.ts
 * @description タブグループのデータ管理（ロード・URL解決・ストレージ同期）を担う
 * カスタムフック。マイグレーションの実行、初回ロード、URL取得の非同期処理を内包する。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import { getParentCategories } from '@/lib/storage/categories'
import {
  migrateParentCategoriesToDomainNames,
  migrateToUrlsStorage,
} from '@/lib/storage/migration'
import { getUserSettings } from '@/lib/storage/settings'
import { resolveTabGroupsWithUrls } from '@/lib/storage/tabs'
import type { ParentCategory, TabGroup, UserSettings } from '@/types/storage'

/** UseTabData フックの戻り値型 */
interface UseTabDataReturn {
  /** 保存済みタブグループ一覧（URLデータなし・rawデータ） */
  tabGroups: TabGroup[]
  /** TabGroups を直接更新するセッター */
  setTabGroups: Dispatch<SetStateAction<TabGroup[]>>
  /** 初回ロード完了まで true */
  isLoading: boolean
  /** URLデータを解決済みのタブグループ一覧 */
  tabGroupsWithUrls: TabGroup[]
  /**
   * タブグループ配列に対して URL ストレージからデータを取得し、
   * tabGroupsWithUrls を更新する。
   * @param groups - URL を解決するタブグループ配列
   */
  loadTabGroupsWithUrls: (groups: TabGroup[]) => Promise<TabGroup[]>
  /**
   * ストレージから最新の savedTabs を取得して tabGroups と tabGroupsWithUrls を再同期する。
   * @param nextGroups - 省略した場合はストレージから取得する
   */
  refreshTabGroupsWithUrls: (nextGroups?: TabGroup[]) => Promise<TabGroup[]>
}
const runInitialMigrations = async (): Promise<void> => {
  console.log('ページ読み込み時の親カテゴリ移行処理を開始...')
  try {
    await migrateParentCategoriesToDomainNames()
  } catch (error) {
    console.error('親カテゴリ移行エラー:', error)
  }
  try {
    console.log('URL管理マイグレーションを開始...')
    await migrateToUrlsStorage()
    console.log('URL管理マイグレーションが完了しました')
  } catch (error) {
    console.error('URL管理マイグレーションエラー:', error)
  }
}
const logSavedTabsSummary = (savedTabs: TabGroup[]): void => {
  console.log('読み込まれたタブ:', savedTabs)
  console.log('タブグループ数:', savedTabs.length)
  for (const group of savedTabs) {
    console.log(`グループ ${group.domain}:`, {
      id: group.id,
      urlIds: group.urlIds?.length ?? 0,
      urlSubCategories: group.urlSubCategories
        ? Object.keys(group.urlSubCategories).length
        : 0,
      urls: group.urls?.length ?? 0,
    })
  }
  if (savedTabs.length === 0) {
    console.log('タブグループが空です。テストデータの有無を確認...')
  }
}
const ensureValidParentCategories = async (
  parentCategories: ParentCategory[],
): Promise<ParentCategory[]> => {
  const hasInvalidCategory = parentCategories.some(
    (cat) => !(cat.domainNames && Array.isArray(cat.domainNames)),
  )
  if (!(hasInvalidCategory || parentCategories.length === 0)) {
    return parentCategories
  }
  console.log('無効なカテゴリを検出、再マイグレーションを実行')
  await migrateParentCategoriesToDomainNames()
  return getParentCategories()
}
const repairSavedTabParentCategoryIds = (
  savedTabs: TabGroup[],
  parentCategories: ParentCategory[],
): {
  updatedTabGroups: TabGroup[]
  needsUpdate: boolean
} => {
  let needsUpdate = false
  const categoryByDomainId = new Map<string, ParentCategory>()
  const categoryByDomainName = new Map<string, ParentCategory>()
  for (const category of parentCategories) {
    for (const domainId of category.domains ?? []) {
      categoryByDomainId.set(domainId, category)
    }
    for (const domainName of category.domainNames ?? []) {
      categoryByDomainName.set(domainName, category)
    }
  }
  const updatedTabGroups = savedTabs.map((group: TabGroup) => {
    if (group.parentCategoryId) {
      return group
    }
    const categoryById = categoryByDomainId.get(group.id)
    if (categoryById) {
      console.log(
        `TabGroup ${group.domain} のparentCategoryIdを ${categoryById.id} に修復しました (IDベース)`,
      )
      needsUpdate = true
      return {
        ...group,
        parentCategoryId: categoryById.id,
      }
    }
    const categoryByName = categoryByDomainName.get(group.domain)
    if (categoryByName) {
      console.log(
        `TabGroup ${group.domain} のparentCategoryIdを ${categoryByName.id} に修復しました (ドメイン名ベース)`,
      )
      needsUpdate = true
      return {
        ...group,
        parentCategoryId: categoryByName.id,
      }
    }
    return group
  })
  return {
    needsUpdate,
    updatedTabGroups,
  }
}
/**
 * タブグループデータの管理フック。
 * マイグレーション実行・初回ロード・URL解決・ストレージ変更連携を担う。
 *
 * @param onCategoriesLoaded - 初回ロード時にカテゴリが確定したときに呼び出されるコールバック
 * @param onSettingsLoaded   - 初回ロード時にユーザー設定が確定したときに呼び出されるコールバック
 * @returns UseTabDataReturn
 */
const useTabData = (
  onCategoriesLoaded: (categories: ParentCategory[]) => void,
  onSettingsLoaded: (settings: UserSettings) => void,
): UseTabDataReturn => {
  const [{ isLoading, tabGroups, tabGroupsWithUrls }, setTabData] = useState({
    isLoading: true,
    tabGroups: [] as TabGroup[],
    tabGroupsWithUrls: [] as TabGroup[],
  })
  const setTabGroups: Dispatch<SetStateAction<TabGroup[]>> = useCallback(
    (nextGroups) => {
      setTabData((prev) => ({
        ...prev,
        tabGroups:
          typeof nextGroups === 'function'
            ? nextGroups(prev.tabGroups)
            : nextGroups,
      }))
    },
    [],
  )
  const skipNextTabGroupsSyncRef = useRef(false)

  // コールバック参照を ref で保持（useEffect 依存配列の安定性のため）
  const onCategoriesLoadedRef = useRef(onCategoriesLoaded)
  const onSettingsLoadedRef = useRef(onSettingsLoaded)
  useEffect(() => {
    onCategoriesLoadedRef.current = onCategoriesLoaded
  }, [onCategoriesLoaded])
  useEffect(() => {
    onSettingsLoadedRef.current = onSettingsLoaded
  }, [onSettingsLoaded])

  /**
   * タブグループ配列に対して各グループの URL をストレージから取得する。
   * @param groups - 対象のタブグループ配列
   * @returns URL が解決されたタブグループ配列
   */
  const loadTabGroupsWithUrls = useCallback(
    async (groups: TabGroup[]): Promise<TabGroup[]> => {
      if (groups.length === 0) {
        return []
      }
      console.log('タブグループのURL取得を開始...')
      const groupsWithUrls = await resolveTabGroupsWithUrls(groups)
      for (const group of groupsWithUrls) {
        if (group.urlIds && group.urlIds.length > 0) {
          console.log(
            `グループ ${group.domain}: ${group.urls?.length ?? 0}個のURLを取得`,
          )
          continue
        }
        if (group.urls && group.urls.length > 0) {
          console.log(`グループ ${group.domain}: 旧形式のまま使用`)
          continue
        }
        console.log(`グループ ${group.domain}: URLなし`)
      }
      return groupsWithUrls
    },
    [],
  )

  /**
   * ストレージから最新の savedTabs を取得して tabGroups と tabGroupsWithUrls を再同期する。
   * @param nextGroups - 省略した場合はストレージから取得する
   * @returns 正規化されたタブグループ配列
   */
  const refreshTabGroupsWithUrls = useCallback(
    async (nextGroups?: TabGroup[]): Promise<TabGroup[]> => {
      const groups =
        nextGroups ??
        (
          await chrome.storage.local.get<{
            savedTabs?: TabGroup[]
          }>('savedTabs')
        ).savedTabs ??
        []
      const normalizedGroups = Array.isArray(groups) ? groups : []
      const groupsWithUrls = await loadTabGroupsWithUrls(normalizedGroups)
      skipNextTabGroupsSyncRef.current = true
      setTabData((prev) => ({
        ...prev,
        tabGroups: normalizedGroups,
        tabGroupsWithUrls: groupsWithUrls,
      }))
      return normalizedGroups
    },
    [loadTabGroupsWithUrls],
  )

  // ページ読み込み時にマイグレーションを実行して初回データをロードする
  useEffect(() => {
    const loadSavedTabs = async () => {
      try {
        await runInitialMigrations()

        // データ読み込み
        const storageResult = await chrome.storage.local.get<{
          savedTabs?: TabGroup[]
        }>('savedTabs')
        const savedTabs: TabGroup[] = Array.isArray(storageResult.savedTabs)
          ? storageResult.savedTabs
          : []
        logSavedTabsSummary(savedTabs)
        const [urlStorageResult, allStorage, userSettings, parentCategories] =
          await Promise.all([
            chrome.storage.local.get('urls'),
            chrome.storage.local.get(),
            getUserSettings(),
            getParentCategories(),
          ])

        // URLストレージの内容を確認
        const urls = Array.isArray(urlStorageResult.urls)
          ? urlStorageResult.urls
          : []
        console.log('URLストレージ内容:', urls)
        console.log('URLレコード数:', urls.length)

        // 全ストレージ内容を確認
        console.log('全ストレージ内容:', allStorage)
        console.log('ストレージキー一覧:', Object.keys(allStorage))

        // ユーザー設定を親コンポーネントに通知
        onSettingsLoadedRef.current(userSettings)

        // カテゴリを読み込み
        console.log('読み込まれた親カテゴリ:', parentCategories)
        const finalCategories =
          await ensureValidParentCategories(parentCategories)
        onCategoriesLoadedRef.current(finalCategories)
        const { updatedTabGroups, needsUpdate } =
          repairSavedTabParentCategoryIds(savedTabs, finalCategories)

        // 修復が必要な場合はストレージを更新
        if (needsUpdate) {
          await chrome.storage.local.set({
            savedTabs: updatedTabGroups,
          })
          console.log('TabGroupのparentCategoryId修復処理が完了しました')
        }
        setTabData((prev) => ({
          ...prev,
          isLoading: false,
          tabGroups: needsUpdate ? updatedTabGroups : savedTabs,
        }))
      } catch (error) {
        console.error('保存されたタブの読み込みエラー:', error)
        setTabData((prev) => ({
          ...prev,
          isLoading: false,
        }))
      }
    }
    // eslint-disable-next-line typescript/no-floating-promises
    loadSavedTabs()
  }, [])

  // タブグループが更新されたらURLデータを取得する
  useEffect(() => {
    let cancelled = false
    const loadUrlsForTabGroups = async () => {
      if (skipNextTabGroupsSyncRef.current) {
        skipNextTabGroupsSyncRef.current = false
        return
      }
      const groupsWithUrls = await loadTabGroupsWithUrls(tabGroups)
      if (!cancelled) {
        console.log('URL取得完了、状態を更新...')
        setTabData((prev) => ({
          ...prev,
          tabGroupsWithUrls: groupsWithUrls,
        }))
      }
    }
    // eslint-disable-next-line typescript/no-floating-promises
    loadUrlsForTabGroups()
    return () => {
      cancelled = true
    }
  }, [tabGroups, loadTabGroupsWithUrls])
  return {
    isLoading,
    loadTabGroupsWithUrls,
    refreshTabGroupsWithUrls,
    setTabGroups,
    tabGroups,
    tabGroupsWithUrls,
  }
}

export type { UseTabDataReturn }
export { useTabData }
