import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useRef } from 'react'
import { toast } from 'sonner'

import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import { UrlOpeningPostProcessingError } from '@/contexts/saved-tabs/application/errors/UrlOpeningPostProcessingError'
import type { SavedTabsPresentationPorts } from '@/contexts/saved-tabs/application/ports/SavedTabsPresentationPorts'
import {
  showOpenedUrlsUndoToast,
  toDomainParentCategories,
} from '@/contexts/saved-tabs/presentation/app/savedTabsApp.helpers'
import type {
  SavedTabsCustomProjectDto as CustomProject,
  SavedTabsParentCategoryDto as ParentCategory,
  SavedTabsTabGroupDto as TabGroup,
  SavedTabsUserSettingsDto as UserSettingsDto,
} from '@/contexts/saved-tabs/presentation/types/SavedTabsCompatibilityViewModel'
import type { TranslateFn } from '@/features/i18n/context/I18nProvider'

type UseTabOpeningHandlersDeps = {
  savedTabsUseCases: SavedTabsUseCases
  deps: SavedTabsPresentationPorts
  settings: UserSettingsDto
  categories: ParentCategory[]
  refreshTabGroupsWithUrls: (tabGroups?: TabGroup[]) => Promise<TabGroup[]>
  setCustomProjects: Dispatch<SetStateAction<CustomProject[]>>
  t: TranslateFn
}

type OpeningUrl = { readonly url: string; readonly title: string }

export const useTabOpeningHandlers = ({
  savedTabsUseCases,
  deps,
  settings,
  categories,
  refreshTabGroupsWithUrls,
  setCustomProjects,
  t,
}: UseTabOpeningHandlersDeps) => {
  const queueRef = useRef<Promise<void> | null>(null)
  const pendingRef = useRef<Map<string, Promise<void>> | null>(null)
  const runOpening = useCallback(
    async (
      urls: readonly string[],
      mode: 'single' | 'bulk',
      execute: () => Promise<void>,
    ): Promise<void> => {
      if (urls.length === 0) {
        return
      }
      const key = JSON.stringify([mode, urls])
      pendingRef.current ??= new Map<string, Promise<void>>()
      const pendingOperations = pendingRef.current
      const pending = pendingOperations.get(key)
      if (pending) {
        return pending
      }
      const operation = (queueRef.current ?? Promise.resolve())
        .then(execute)
        .catch((error: unknown) => {
          const messageKey =
            mode === 'single'
              ? 'savedTabs.tab.openError'
              : 'savedTabs.tab.openAllError'
          toast.error(
            t(
              error instanceof UrlOpeningPostProcessingError
                ? 'savedTabs.tab.openUpdateError'
                : messageKey,
            ),
          )
        })
        .finally(() => {
          pendingOperations.delete(key)
        })
      queueRef.current = operation
      pendingOperations.set(key, operation)
      return operation
    },
    [t],
  )
  const handleOpenTab = useCallback(
    async (url: string) => {
      await runOpening([url], 'single', async () => {
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

        const result = await savedTabsUseCases.openSavedUrl({
          origin: 'click',
          settings: {
            removeTabAfterExternalDrop: false,
            removeTabAfterOpen: settings.removeTabAfterOpen,
          },
          urlRecordId: lookup.record.id,
        })

        if (snapshot && result.snapshot) {
          try {
            await refreshTabGroupsWithUrls()
            showOpenedUrlsUndoToast({
              count: 1,
              refreshTabGroupsWithUrls,
              savedTabsUseCases,
              setCustomProjects,
              snapshot,
              t,
            })
          } catch {
            toast.error(t('savedTabs.tab.openUpdateError'))
          }
        }
      })
    },
    [
      runOpening,
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
    async (urls: readonly OpeningUrl[]) => {
      await runOpening(
        urls.map(({ url }) => url),
        'bulk',
        async () => {
          const snapshot = settings.removeTabAfterOpen
            ? await savedTabsUseCases.buildSavedTabsSnapshot({
                parentCategories: toDomainParentCategories(categories),
              })
            : undefined
          const result = await savedTabsUseCases.openAllSavedUrls({
            mode: settings.openAllInNewWindow ? 'newWindow' : 'backgroundTabs',
            removeTabAfterOpen: settings.removeTabAfterOpen,
            urls: urls.map(({ url }) => url),
          })

          if (snapshot && result.snapshot) {
            try {
              await refreshTabGroupsWithUrls()
              showOpenedUrlsUndoToast({
                count: result.removedUrlRecordIds.length,
                refreshTabGroupsWithUrls,
                savedTabsUseCases,
                setCustomProjects,
                snapshot,
                t,
              })
            } catch {
              toast.error(t('savedTabs.tab.openUpdateError'))
              return
            }
          }
          if (result.failedUrls.length > 0) {
            toast.error(t('savedTabs.tab.openAllError'))
          }
        },
      )
    },
    [
      runOpening,
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
