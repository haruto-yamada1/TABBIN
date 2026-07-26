import type { Dispatch, SetStateAction } from 'react'
import { useCallback } from 'react'

import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsParentCategoryDto as ParentCategory,
  SavedTabsTabGroupDto as TabGroup,
  SavedTabsUserSettingsDto as UserSettingsDto,
} from '@/contexts/saved-tabs/application/dto/SavedTabsPresentationDto'
import type { SavedTabsPresentationPorts } from '@/contexts/saved-tabs/application/ports/SavedTabsPresentationPorts'
import {
  showOpenedUrlsUndoToast,
  toDomainParentCategories,
} from '@/contexts/saved-tabs/presentation/app/savedTabsApp.helpers'
import type { TranslateFn } from '@/features/i18n/context/I18nProvider'
import { redactUrlForLog } from '@/lib/logging/redact-url'

type UseTabOpeningHandlersDeps = {
  savedTabsUseCases: SavedTabsUseCases
  deps: SavedTabsPresentationPorts
  settings: UserSettingsDto
  categories: ParentCategory[]
  refreshTabGroupsWithUrls: (tabGroups?: TabGroup[]) => Promise<TabGroup[]>
  setCustomProjects: Dispatch<SetStateAction<CustomProject[]>>
  t: TranslateFn
}

export const useTabOpeningHandlers = ({
  savedTabsUseCases,
  deps,
  settings,
  categories,
  refreshTabGroupsWithUrls,
  setCustomProjects,
  t,
}: UseTabOpeningHandlersDeps) => {
  const handleOpenTab = useCallback(
    async (url: string) => {
      try {
        const lookup = await savedTabsUseCases.findUrlRecordByUrl({ url })

        if (!lookup.record) {
          await deps.browserTabPort.open({ url })
          return
        }

        const snapshot = settings.removeTabAfterOpen
          ? await savedTabsUseCases.buildSavedTabsSnapshot({
              parentCategories: toDomainParentCategories(categories),
            })
          : undefined

        const urlRecordId = lookup.record.id
        const result = await savedTabsUseCases.openSavedUrl({
          origin: 'click',
          settings: {
            removeTabAfterExternalDrop: false,
            removeTabAfterOpen: settings.removeTabAfterOpen,
          },
          urlRecordId,
        })

        if (snapshot && result.snapshot) {
          await refreshTabGroupsWithUrls()
          showOpenedUrlsUndoToast({
            count: 1,
            refreshTabGroupsWithUrls,
            savedTabsUseCases,
            setCustomProjects,
            snapshot,
            t,
          })
          console.log(
            `URL ${redactUrlForLog(url)} を開いた後、保存データから削除しました`,
          )
        }
      } catch (error) {
        console.error('タブを開く処理エラー:', error)
      }
    },
    [
      savedTabsUseCases,
      deps,
      settings.removeTabAfterOpen,
      categories,
      refreshTabGroupsWithUrls,
      setCustomProjects,
      t,
    ],
  )

  const handleOpenAllTabs = useCallback(
    async (
      urls: {
        url: string
        title: string
      }[],
    ) => {
      try {
        const preDeleteSnapshot = settings.removeTabAfterOpen
          ? await savedTabsUseCases.buildSavedTabsSnapshot({
              parentCategories: toDomainParentCategories(categories),
            })
          : undefined

        const result = await savedTabsUseCases.openAllSavedUrls({
          mode: settings.openAllInNewWindow ? 'newWindow' : 'backgroundTabs',
          removeTabAfterOpen: settings.removeTabAfterOpen,
          urls: urls.map((u) => u.url),
        })

        if (
          settings.removeTabAfterOpen &&
          preDeleteSnapshot &&
          result.snapshot
        ) {
          await refreshTabGroupsWithUrls()
          showOpenedUrlsUndoToast({
            count: result.removedUrlRecordIds.length,
            refreshTabGroupsWithUrls,
            savedTabsUseCases,
            setCustomProjects,
            snapshot: preDeleteSnapshot,
            t,
          })
          console.log(
            `${urls.length}個のURLを開いた後、保存データから削除しました`,
          )
        }
      } catch (error) {
        console.error('タブ一括オープンエラー:', error)
      }
    },
    [
      settings.openAllInNewWindow,
      settings.removeTabAfterOpen,
      savedTabsUseCases,
      categories,
      refreshTabGroupsWithUrls,
      setCustomProjects,
      t,
    ],
  )

  return { handleOpenTab, handleOpenAllTabs }
}
