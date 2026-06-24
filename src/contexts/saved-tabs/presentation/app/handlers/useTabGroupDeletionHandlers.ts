import type { Dispatch, SetStateAction } from 'react'
import { useCallback } from 'react'

import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsParentCategoryDto as ParentCategory,
  SavedTabsTabGroupDto as TabGroup,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import { toStorageParentCategory } from '@/contexts/saved-tabs/application/mappers/SavedTabsSnapshotMapper'
import {
  countTabGroupUrls,
  createFilterGroupsByExcludedIdsUpdater,
  getSnapshotSavedTabs,
  notifyDeleteFailure,
  showOpenedUrlsUndoToast,
  toDomainParentCategories,
} from '@/contexts/saved-tabs/presentation/app/savedTabsApp.helpers'
import type { OpenedUrlsStorageSnapshot } from '@/contexts/saved-tabs/presentation/app/savedTabsApp.helpers'
import type { TranslateFn } from '@/features/i18n/context/I18nProvider'
import { redactUrlForLog } from '@/lib/logging/redact-url'

interface UseTabGroupDeletionHandlersDeps {
  isUncategorizedReorderMode: boolean
  setTempUncategorizedOrder: Dispatch<SetStateAction<TabGroup[]>>
  categories: ParentCategory[]
  refreshTabGroupsWithUrls: (tabGroups?: TabGroup[]) => Promise<TabGroup[]>
  savedTabsUseCases: SavedTabsUseCases
  setCustomProjects: Dispatch<SetStateAction<CustomProject[]>>
  setCategories: Dispatch<SetStateAction<ParentCategory[]>>
  t: TranslateFn
}

export const useTabGroupDeletionHandlers = ({
  isUncategorizedReorderMode,
  setTempUncategorizedOrder,
  categories,
  refreshTabGroupsWithUrls,
  savedTabsUseCases,
  setCustomProjects,
  setCategories,
  t,
}: UseTabGroupDeletionHandlersDeps) => {
  // 単一 TabGroup 削除を DeleteTabGroupUseCase 経由に置き換える。
  // - 削除判断・未参照 URL 削除・対象 TabGroup の storage 書き戻しは
  //   use-case に委譲し、UI 側は storage 直叩きを持たない。
  // - Undo snapshot は `BuildSavedTabsSnapshotUseCase` 経由で repository
  //   群から組み立て、storage 直叩きは use-case 経由へ移行済み
  //   （issue #494）。
  // - 削除前処理 (`handleTabGroupRemoval`) は issue #524 で
  //   `PrepareTabGroupDeletionUseCase` へ移設済み。UI 側は
  //   `categoriesCommandService` / `domainCategoryMappingRepository` /
  //   `parentCategoryRepository` / `tabGroupRepository` を直接束ねない。
  // - `removeUrlsFromCustomProjectsForGroup` は issue #512 で
  //   `savedTabsUseCases.removeUrlsFromCustomProjects` use-case へ
  //   移設済み。
  const handleDeleteGroup = useCallback(
    async (id: string) => {
      let deleteSnapshot: OpenedUrlsStorageSnapshot | undefined
      try {
        // 削除前にカテゴリ設定と親カテゴリ情報を含めた snapshot を取得
        deleteSnapshot = await savedTabsUseCases.buildSavedTabsSnapshot({
          parentCategories: toDomainParentCategories(categories),
        })
        const savedTabs = getSnapshotSavedTabs(deleteSnapshot)
        const groupToDelete = savedTabs.find((group) => group.id === id)
        if (!groupToDelete) {
          return
        }
        console.log(`グループを削除: ${redactUrlForLog(groupToDelete.domain)}`)

        // 削除前処理は `PrepareTabGroupDeletionUseCase` 経由 (issue #524)。
        // `categoriesCommandService` / `domainCategoryMappingRepository` /
        // `parentCategoryRepository` / `tabGroupRepository` を UI 側で
        // 束ねず、application use-case へ委譲する。
        //
        // **逐次実行にする理由**:
        // `PrepareTabGroupDeletionUseCase` は内部で
        // `tabGroupRepository.findRawTabGroupById` を呼び、
        // `deleteTabGroup` が先に storage から `savedTabs` を消すと
        // preflight が `null` を見て silent skip する
        // (Codex review P2)。`removeUrlsFromCustomProjects` は
        // customProjects 側なので、削除本体 (`deleteTabGroup`) 完了後に
        // 実行しても整合性は保たれる。
        await savedTabsUseCases.prepareTabGroupDeletion({
          // eslint-disable-next-line typescript/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-type-assertion -- domain TabGroupId と storage 側の branded 差異 (issue #511)
          tabGroupId: id,
        })
        // 削除判断・未参照 UrlRecord 掃除・savedTabs の書き戻しは
        // DeleteTabGroupUseCase に委譲する。use-case が見つからない
        // グループを SavedTabsDomainError で通知するため、UI 側は
        // 事前に savedTabs から対象グループの存在を保証しておく。
        await savedTabsUseCases.deleteTabGroup({
          // eslint-disable-next-line typescript/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-type-assertion
          tabGroupId: id,
        })
        // グループに属するすべてのURLをカスタムプロジェクトからも削除
        // (issue #512: presentation helper から application use-case
        //  `removeUrlsFromCustomProjects` へ移設済み)。
        await savedTabsUseCases.removeUrlsFromCustomProjects({
          tabGroups: [groupToDelete],
        })

        // 以降は従来通りの処理
        const updatedGroups = savedTabs.filter((group) => group.id !== id)
        await refreshTabGroupsWithUrls(updatedGroups)

        // 並び替えモード中の削除処理：一時的な順序からも削除
        if (isUncategorizedReorderMode) {
          setTempUncategorizedOrder((prev) =>
            prev.filter((group) => group.id !== id),
          )
          console.log(
            `並び替えモード中にドメイン ${redactUrlForLog(groupToDelete.domain)} を一時順序からも削除しました`,
          )
        }

        // 親カテゴリからはドメインIDのみを削除（ドメイン名は保持）。
        // 旧 `removeDomainFromParentCategories` ヘルパーを
        // `removeDomainsFromParentCategories` use-case 経由へ置換 (issue #523)。
        // domainNames は変更しない挙動を維持し、storage 書戻しは
        // use-case 内の `parentCategoryRepository.saveAll` に委譲する。
        // setCategories には storage 形 `ParentCategory[]` が必要なため、
        // 共通 mapper (issue #511) で widening する。
        const updatedDomainCategories =
          await savedTabsUseCases.removeDomainsFromParentCategories({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, typescript/no-unsafe-type-assertion -- domain TabGroupId と storage 側の branded 差異 (issue #511)
            domainIds: [id],
          })
        setCategories(updatedDomainCategories.map(toStorageParentCategory))
        showOpenedUrlsUndoToast({
          count: countTabGroupUrls(groupToDelete),
          messageKey: 'savedTabs.undo.deletedTabs',
          refreshTabGroupsWithUrls,
          savedTabsUseCases,
          setCategories,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })

        console.log('グループ削除処理が完了しました')
      } catch {
        await notifyDeleteFailure({
          refreshTabGroupsWithUrls,
          savedTabsUseCases,
          setCategories,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })
      }
    },
    [
      isUncategorizedReorderMode,
      categories,
      refreshTabGroupsWithUrls,
      savedTabsUseCases,
      setCustomProjects,
      setCategories,
      setTempUncategorizedOrder,
      t,
    ],
  )

  const handleDeleteGroups = useCallback(
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps.* 配下は composition 安定参照
    async (ids: string[]) => {
      if (ids.length === 0) {
        return
      }
      let deleteSnapshot: OpenedUrlsStorageSnapshot | undefined
      try {
        // 削除前のスナップショットは `BuildSavedTabsSnapshotUseCase` 経由で
        // repository 群から組み立て、Undo 時の storage 全体復元
        // （`customProjects` / `customProjectOrder` を含む）で使う
        // （issue #494）。`savedTabs` 側の削除本体は use-case 側に委譲する。
        deleteSnapshot = await savedTabsUseCases.buildSavedTabsSnapshot({
          parentCategories: toDomainParentCategories(categories),
        })
        const savedTabs = getSnapshotSavedTabs(deleteSnapshot)

        const groupsToDelete = savedTabs.filter((group) =>
          ids.includes(group.id),
        )
        if (groupsToDelete.length === 0) {
          return
        }

        console.log(`${groupsToDelete.length}件のグループを一括削除します`)

        // 旧 `features/saved-tabs/lib/tab-operations` のドメイン設定
        // 保存処理は、他 storage key（domainCategorySettings /
        // parentCategories.domainNames）を触る副作用のため、issue 範囲外
        // として従来通り UI 側で実行していたが、issue #524 で
        // `PrepareTabGroupsDeletionUseCase` へ移設済み。UI 側は
        // `categoriesCommandService` / `domainCategoryMappingRepository` /
        // `parentCategoryRepository` / `tabGroupRepository` を直接
        // 束ねず、application use-case へ委譲する。
        //
        // **逐次実行にする理由**:
        // `PrepareTabGroupsDeletionUseCase` は内部で各 group の
        // `tabGroupRepository.findRawTabGroupById` を呼び、
        // `deleteTabGroups` が先に storage から `savedTabs` を消すと
        // preflight が `null` を見て silent skip する
        // (Codex review P2)。`removeUrlsFromCustomProjects` は
        // customProjects 側なので、削除本体完了後に実行しても整合性は
        // 保たれる。
        await savedTabsUseCases.prepareTabGroupsDeletion({
          // eslint-disable-next-line typescript/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-type-assertion -- domain TabGroupId と storage 側の branded 差異 (issue #511)
          tabGroupIds: ids,
        })
        // 複数 TabGroup 削除本体は DeleteTabGroupsUseCase 経由に置き換える。
        // 未参照になった UrlRecord の掃除と savedTabs の書き戻しは
        // use-case が一括で行う。
        await savedTabsUseCases.deleteTabGroups({
          // eslint-disable-next-line typescript/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-type-assertion
          tabGroupIds: ids as unknown as Parameters<
            typeof savedTabsUseCases.deleteTabGroups
          >[0]['tabGroupIds'],
        })
        // customProject 側の URL ID 同期削除は他 storage key を触る
        // ため、issue 範囲外として従来通り UI 側で実行していたが、
        // issue #512 で `removeUrlsFromCustomProjects` use-case へ
        // 移設済み (issue #540 範囲)。
        await savedTabsUseCases.removeUrlsFromCustomProjects({
          tabGroups: groupsToDelete,
        })

        const idSet = new Set(ids)
        const updatedGroups = savedTabs.filter((group) => !idSet.has(group.id))
        await refreshTabGroupsWithUrls(updatedGroups)

        if (isUncategorizedReorderMode) {
          setTempUncategorizedOrder(
            createFilterGroupsByExcludedIdsUpdater(idSet),
          )
        }

        // 親カテゴリからは削除 ID を一括で取り除く。旧
        // `deps.parentCategoryRepository.saveAll` 直叩きを
        // `removeDomainsFromParentCategories` use-case 経由へ
        // 置換する (issue #523)。domainNames は変更しない挙動を維持し、
        // storage 書戻しは use-case 内の `parentCategoryRepository.saveAll`
        // に委譲する。setCategories には storage 形 `ParentCategory[]` が
        // 必要なので、共通 mapper (issue #511) で widening する。
        const updatedDomainCategories =
          await savedTabsUseCases.removeDomainsFromParentCategories({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, typescript/no-unsafe-type-assertion -- domain TabGroupId と storage 側の branded 差異 (issue #511)
            domainIds: ids,
          })
        setCategories(updatedDomainCategories.map(toStorageParentCategory))
        showOpenedUrlsUndoToast({
          count: groupsToDelete.reduce(
            (total, group) => total + countTabGroupUrls(group),
            0,
          ),
          messageKey: 'savedTabs.undo.deletedTabs',
          refreshTabGroupsWithUrls,
          savedTabsUseCases,
          setCategories,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })

        console.log('一括グループ削除処理が完了しました')
      } catch {
        await notifyDeleteFailure({
          refreshTabGroupsWithUrls,
          savedTabsUseCases,
          setCategories,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })
      }
    },
    [
      isUncategorizedReorderMode,
      categories,
      refreshTabGroupsWithUrls,
      savedTabsUseCases,
      setCustomProjects,
      setCategories,
      setTempUncategorizedOrder,
      t,
    ],
  )
  const handleDeleteUrl = useCallback(
    async (groupId: string, url: string) => {
      let deleteSnapshot: OpenedUrlsStorageSnapshot | undefined
      try {
        // Undo 用 snapshot は `BuildSavedTabsSnapshotUseCase` 経由で
        // repository 群から組み立て、storage 直叩きは use-case 経由へ
        // 移行済み（issue #494）。
        deleteSnapshot = await savedTabsUseCases.buildSavedTabsSnapshot({
          parentCategories: toDomainParentCategories(categories),
        })
        // 単体 URL 削除は DeleteSavedUrlUseCase 経由に置き換える。
        // TabGroup と未参照 UrlRecord の削除は use-case に委譲し、
        // customProject 側の URL 同期削除は他 storage key を触るため
        // issue 範囲外として従来通り UI 側で実行する。
        await savedTabsUseCases.deleteSavedUrl({
          // eslint-disable-next-line typescript/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-type-assertion
          tabGroupId: groupId as unknown as Parameters<
            typeof savedTabsUseCases.deleteSavedUrl
          >[0]['tabGroupId'],
          url,
        })
        showOpenedUrlsUndoToast({
          count: 1,
          messageKey: 'savedTabs.undo.deletedTabs',
          refreshTabGroupsWithUrls,
          savedTabsUseCases,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })
        console.log(
          `URL ${redactUrlForLog(url)} をグループ ${groupId} から削除しました`,
        )
      } catch {
        await notifyDeleteFailure({
          refreshTabGroupsWithUrls,
          savedTabsUseCases,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })
      }
    },
    [
      categories,
      refreshTabGroupsWithUrls,
      savedTabsUseCases,
      setCustomProjects,
      t,
    ],
  )
  const handleDeleteUrls = useCallback(
    async (groupId: string, urls: string[]) => {
      if (urls.length === 0) {
        return
      }
      let deleteSnapshot: OpenedUrlsStorageSnapshot | undefined
      try {
        // Undo 用 snapshot は `BuildSavedTabsSnapshotUseCase` 経由で取得
        // （issue #494）。
        deleteSnapshot = await savedTabsUseCases.buildSavedTabsSnapshot({
          parentCategories: toDomainParentCategories(categories),
        })
        // 複数 URL 削除は DeleteSavedUrlsUseCase 経由に置き換える。
        await savedTabsUseCases.deleteSavedUrls({
          // eslint-disable-next-line typescript/no-unsafe-type-assertion, @typescript-eslint/no-unsafe-type-assertion
          tabGroupId: groupId as unknown as Parameters<
            typeof savedTabsUseCases.deleteSavedUrls
          >[0]['tabGroupId'],
          urls,
        })
        console.log(
          `${urls.length}件のURLをグループ ${groupId} から削除しました`,
        )
        showOpenedUrlsUndoToast({
          count: urls.length,
          messageKey: 'savedTabs.undo.deletedTabs',
          refreshTabGroupsWithUrls,
          savedTabsUseCases,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })
      } catch {
        await notifyDeleteFailure({
          refreshTabGroupsWithUrls,
          savedTabsUseCases,
          setCustomProjects,
          snapshot: deleteSnapshot,
          t,
        })
      }
    },
    [
      categories,
      refreshTabGroupsWithUrls,
      savedTabsUseCases,
      setCustomProjects,
      t,
    ],
  )
  const handleUpdateUrls = useCallback(
    async (groupId: string, _updatedUrls: TabGroup['urls']) => {
      await Promise.resolve()
      console.log(`グループ ${groupId} のURL更新はストレージ同期に委譲しました`)
    },
    [],
  )

  return {
    handleDeleteGroup,
    handleDeleteGroups,
    handleDeleteUrl,
    handleDeleteUrls,
    handleUpdateUrls,
  }
}
