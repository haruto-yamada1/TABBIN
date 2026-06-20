/**
 * @file useTabData.ts
 * @description タブグループのデータ管理（ロード・URL解決・ストレージ同期）を担う
 * カスタムフック。マイグレーションの実行、初回ロード、URL取得の非同期処理を内包する。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'

import {
  toDomainParentCategoriesFromStorage,
  toDomainTabGroupsFromStorage,
  toPresentationTabGroups,
} from '@/contexts/saved-tabs/application/mappers/SavedTabsSnapshotMapper'
import type { MigrationPort } from '@/contexts/saved-tabs/application/ports/MigrationPort'
import type { GetSavedTabsPageDataQuery } from '@/contexts/saved-tabs/application/queries/GetSavedTabsPageDataQuery'
import type { GetSavedTabsQuery } from '@/contexts/saved-tabs/application/queries/GetSavedTabsQuery'
import type { LoadTabGroupsWithUrlsUseCase } from '@/contexts/saved-tabs/application/use-cases/LoadTabGroupsWithUrlsUseCase'
import type {
  RepairTabGroupParentCategoryIdsCommand,
  RepairTabGroupParentCategoryIdsUseCase,
} from '@/contexts/saved-tabs/application/use-cases/RepairTabGroupParentCategoryIdsUseCase'
import type { UserSettingsDto } from '@/contexts/saved-tabs/domain/dto/UserSettingsDto'
import { redactUrlForLog } from '@/lib/logging/redact-url'
import type { ParentCategory, TabGroup } from '@/types/storage'

/** UseTabData フックの引数 */
interface UseTabDataParams {
  /** URL 解決用 use-case。presentation 層が `loadTabGroupsWithUrls` 相当の操作で `@/lib/storage/tabs` を直接呼ばないようにするための依存注入ポイント。 */
  readonly loadTabGroupsWithUrlsUseCase: LoadTabGroupsWithUrlsUseCase
  /**
   * 保存タブページ全体の読み取り専用スナップショット query。
   * `tabGroupRepository` / `parentCategoryRepository` /
   * `userSettingsRepository` の直叩きを統合し、presentation 層からは
   * 1 つの関数で受け取る形に集約する（issue #510）。
   */
  readonly getSavedTabsPageDataQuery: GetSavedTabsPageDataQuery
  /**
   * 保存タブ一覧の軽量 query。`tabGroupRepository.findAll` の
   * application 側ラッパ (issue #517)。`refreshTabGroupsWithUrls` の
   * 引数なし経路で利用する。
   */
  readonly getSavedTabsQuery: GetSavedTabsQuery
  /**
   * `parentCategoryId` 未設定の `TabGroup` を `ParentCategory` 側の
   * `domains` / `domainNames` から修復する use-case (issue #517)。
   * 初回ロード時の修復保存を担う。
   */
  readonly repairTabGroupParentCategoryIdsUseCase: RepairTabGroupParentCategoryIdsUseCase
  /**
   * migration port。旧 `migrateParentCategoriesToDomainNames` /
   * `migrateToUrlsStorage` の DDD port 化（issue #509）。
   */
  readonly migrationPort: MigrationPort
  /** 初回ロード時にカテゴリが確定したときに呼び出されるコールバック */
  readonly onCategoriesLoaded: (categories: ParentCategory[]) => void
  /** 初回ロード時にユーザー設定が確定したときに呼び出されるコールバック */
  readonly onSettingsLoaded: (settings: UserSettingsDto) => void
}

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
const runInitialMigrations = async (
  migrationPort: MigrationPort,
): Promise<void> => {
  console.log('ページ読み込み時の親カテゴリ移行処理を開始...')
  try {
    await migrationPort.migrateParentCategoriesToDomainNames()
  } catch (error) {
    console.error('親カテゴリ移行エラー:', error)
  }
  try {
    console.log('URL管理マイグレーションを開始...')
    await migrationPort.migrateToUrlsStorage()
    console.log('URL管理マイグレーションが完了しました')
  } catch (error) {
    console.error('URL管理マイグレーションエラー:', error)
  }
}
const logSavedTabsSummary = (savedTabs: TabGroup[]): void => {
  console.log('タブグループ数:', savedTabs.length)
  for (const group of savedTabs) {
    console.log(`グループ ${redactUrlForLog(group.domain)}:`, {
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
  getSavedTabsPageDataQuery: GetSavedTabsPageDataQuery,
  migrationPort: MigrationPort,
): Promise<ParentCategory[]> => {
  const hasInvalidCategory = parentCategories.some(
    (cat) =>
      !Object.hasOwn(cat, 'domainNames') || !Array.isArray(cat.domainNames),
  )
  if (!(hasInvalidCategory || parentCategories.length === 0)) {
    return parentCategories
  }
  console.log('無効なカテゴリを検出、再マイグレーションを実行')
  await migrationPort.migrateParentCategoriesToDomainNames()
  // `ensureValidParentCategories` の判定は `domainNames` 未定義/
  // 配列非互換を invalid として検出する。mapper 側で `?? []` 化すると
  // 検出ロジックが破壊されるため、query 戻り値 (branded domain) を
  // そのまま cast して下流判定へ流す。
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- branded ParentCategory → storage 投影 (判定用)
  const refreshed = (await getSavedTabsPageDataQuery())
    .parentCategories as unknown as ParentCategory[]
  return [...refreshed]
}
/**
 * タブグループデータの管理フック。
 * マイグレーション実行・初回ロード・URL解決・ストレージ変更連携を担う。
 *
 * `loadTabGroupsWithUrlsUseCase` を介して URL 解決を委譲する
 * （旧 `@/lib/storage/tabs.resolveTabGroupsWithUrls` 直叩きを置換、
 * issue #501）。
 *
 * 初回ロード時の `tabGroups` / `parentCategories` / `userSettings` は
 * `getSavedTabsPageDataQuery` で 1 度に取得し、presentation 層から
 * `chrome.storage.local` の直叩きと repository 個別の read を撤去する
 * （issue #510）。
 *
 * `tabGroupRepository` の直接依存は撤去済みで、`refreshTabGroupsWithUrls()`
 * の引数なし経路は `getSavedTabsQuery`、初回ロード時の
 * `parentCategoryId` 修復は `repairTabGroupParentCategoryIdsUseCase`
 * 経由に委譲する（issue #517）。
 *
 * @param params - フック引数（use-case / query / port / コールバック）
 * @returns UseTabDataReturn
 */
const useTabData = ({
  loadTabGroupsWithUrlsUseCase,
  getSavedTabsPageDataQuery,
  getSavedTabsQuery,
  repairTabGroupParentCategoryIdsUseCase,
  migrationPort,
  onCategoriesLoaded,
  onSettingsLoaded,
}: UseTabDataParams): UseTabDataReturn => {
  const [tabData, setTabData] = useState({
    isLoading: true,
    tabGroups: [] as TabGroup[],
    tabGroupsWithUrls: [] as TabGroup[],
  })
  const { isLoading, tabGroups, tabGroupsWithUrls } = tabData
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

  // use-case 参照を ref で保持（useCallback の依存安定性のため）
  const loadTabGroupsWithUrlsUseCaseRef = useRef(loadTabGroupsWithUrlsUseCase)
  useEffect(() => {
    loadTabGroupsWithUrlsUseCaseRef.current = loadTabGroupsWithUrlsUseCase
  }, [loadTabGroupsWithUrlsUseCase])

  // query / use-case 参照も ref で保持
  // （useEffect / useCallback の依存安定性のため）
  const getSavedTabsPageDataQueryRef = useRef(getSavedTabsPageDataQuery)
  const getSavedTabsQueryRef = useRef(getSavedTabsQuery)
  const repairTabGroupParentCategoryIdsUseCaseRef = useRef(
    repairTabGroupParentCategoryIdsUseCase,
  )
  const migrationPortRef = useRef(migrationPort)
  useEffect(() => {
    getSavedTabsPageDataQueryRef.current = getSavedTabsPageDataQuery
  }, [getSavedTabsPageDataQuery])
  useEffect(() => {
    getSavedTabsQueryRef.current = getSavedTabsQuery
  }, [getSavedTabsQuery])
  useEffect(() => {
    repairTabGroupParentCategoryIdsUseCaseRef.current =
      repairTabGroupParentCategoryIdsUseCase
  }, [repairTabGroupParentCategoryIdsUseCase])
  useEffect(() => {
    migrationPortRef.current = migrationPort
  }, [migrationPort])

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
      const { tabGroups: groupsWithUrls } =
        await loadTabGroupsWithUrlsUseCaseRef.current({ tabGroups: groups })
      for (const group of groupsWithUrls) {
        if (group.urlIds && group.urlIds.length > 0) {
          console.log(
            `グループ ${redactUrlForLog(group.domain)}: ${group.urls?.length ?? 0}個のURLを取得`,
          )
          continue
        }
        if (group.urls && group.urls.length > 0) {
          console.log(
            `グループ ${redactUrlForLog(group.domain)}: 旧形式のまま使用`,
          )
          continue
        }
        console.log(`グループ ${redactUrlForLog(group.domain)}: URLなし`)
      }
      return [...groupsWithUrls]
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- query は branded domain entity を返し、presentation 層は storage shape で扱う
      const groups =
        nextGroups ??
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        ((await getSavedTabsQueryRef.current()) as unknown as TabGroup[])
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
        await runInitialMigrations(migrationPortRef.current)

        // データ読み込み: page data query 経由 (issue #510)
        const pageData = await getSavedTabsPageDataQueryRef.current()
        // query 戻り値 (branded domain) は presentation 編集前の参照を
        // 保持するため mapper ではなく直接 cast。`ensureValidParentCategories`
        // 側の判定 (`domainNames` 未定義検出) は未定義のまま流す必要がある
        // ため、`?? []` 等で正規化しない。
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- branded → storage 投影 (初期ロード)
        const savedTabs = [...pageData.tabGroups] as unknown as TabGroup[]
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- branded → storage 投影 (初期ロード)
        const parentCategories = [
          ...pageData.parentCategories,
        ] as unknown as ParentCategory[]
        const userSettings = pageData.userSettings
        logSavedTabsSummary(savedTabs)

        // ユーザー設定を親コンポーネントに通知
        onSettingsLoadedRef.current(userSettings)

        // カテゴリを読み込み
        console.log('読み込まれた親カテゴリ:', parentCategories)
        const finalCategories = await ensureValidParentCategories(
          parentCategories,
          getSavedTabsPageDataQueryRef.current,
          migrationPortRef.current,
        )
        onCategoriesLoadedRef.current(finalCategories)

        // parentCategoryId 修復は application use-case 経由 (issue #517)。
        // 修復があった場合のみ use-case 内で `tabGroupRepository.saveAll` が
        // 走り、storage への副作用は use-case 側に閉じている。
        // storage → domain 投影は mapper 内に閉じ、`as never` を排除する。
        const repairCommand: RepairTabGroupParentCategoryIdsCommand = {
          tabGroups: toDomainTabGroupsFromStorage(savedTabs),
          parentCategories:
            toDomainParentCategoriesFromStorage(finalCategories),
        }
        const { tabGroups: repairedTabGroups } =
          await repairTabGroupParentCategoryIdsUseCaseRef.current(repairCommand)
        // domain → presentation 投影は mapper 内に閉じ、`as unknown as` を排除する。
        const finalTabGroups = toPresentationTabGroups(repairedTabGroups)
        setTabData((prev) => ({
          ...prev,
          isLoading: false,
          tabGroups: finalTabGroups,
        }))
      } catch (error) {
        console.error('保存されたタブの読み込みエラー:', error)
        setTabData((prev) => ({
          ...prev,
          isLoading: false,
        }))
      }
    }
    void loadSavedTabs()
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
    void loadUrlsForTabGroups()
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
