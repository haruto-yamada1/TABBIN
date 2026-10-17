import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useRef, useState } from 'react'

import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import { toBrowserOpenFailureReason } from '@/contexts/saved-tabs/application/errors/BrowserOpenError'
import type { BrowserOpenFailureReason } from '@/contexts/saved-tabs/application/errors/BrowserOpenError'
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

export type UrlOpeningOperation = {
  readonly status: 'running' | 'complete'
  readonly postProcessingFailed?: boolean
  readonly total: number
  readonly opened: number
  readonly failedUrls: readonly {
    readonly url: string
    readonly reason: BrowserOpenFailureReason
  }[]
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
  const [openingOperation, setOpeningOperation] =
    useState<UrlOpeningOperation | null>(null)
  const queueRef = useRef<Promise<void> | null>(null)
  const pendingRef = useRef<Map<string, Promise<void>> | null>(null)
  const lastModeRef = useRef<'single' | 'bulk'>('single')
  const runOpening = useCallback(
    async (
      urls: readonly string[],
      mode: 'single' | 'bulk',
      execute: () => Promise<
        Pick<
          UrlOpeningOperation,
          'opened' | 'failedUrls' | 'postProcessingFailed'
        >
      >,
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
        .then(async () => {
          lastModeRef.current = mode
          setOpeningOperation({
            status: 'running',
            total: urls.length,
            opened: 0,
            failedUrls: [],
          })
          try {
            const outcome = await execute()
            setOpeningOperation({
              status: 'complete',
              total: urls.length,
              ...outcome,
            })
          } catch (error) {
            if (error instanceof UrlOpeningPostProcessingError) {
              setOpeningOperation({
                status: 'complete',
                total: urls.length,
                opened: error.openedUrls.length,
                failedUrls: error.failedUrls,
                postProcessingFailed: true,
              })
            } else {
              setOpeningOperation({
                status: 'complete',
                total: urls.length,
                opened: 0,
                failedUrls: urls.map((url) => ({
                  url,
                  reason: toBrowserOpenFailureReason(error),
                })),
              })
            }
          }
        })
        .finally(() => {
          pendingOperations.delete(key)
        })
      queueRef.current = operation
      pendingOperations.set(key, operation)
      return operation
    },
    [],
  )
  const handleOpenTab = useCallback(
    async (url: string) => {
      await runOpening([url], 'single', async () => {
        const lookup = await savedTabsUseCases.findUrlRecordByUrl({ url })

        if (!lookup.record) {
          await deps.browserTabPort.open({ url })
          return { opened: 1, failedUrls: [] }
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
            return { opened: 1, failedUrls: [], postProcessingFailed: true }
          }
        }
        return { opened: 1, failedUrls: [] }
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
    async (
      urls: {
        url: string
        title: string
      }[],
    ) => {
      await runOpening(
        urls.map(({ url }) => url),
        'bulk',
        async () => {
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
            try {
              await refreshTabGroupsWithUrls()
              showOpenedUrlsUndoToast({
                count: result.removedUrlRecordIds.length,
                refreshTabGroupsWithUrls,
                savedTabsUseCases,
                setCustomProjects,
                snapshot: preDeleteSnapshot,
                t,
              })
            } catch {
              return {
                opened: result.openedUrls.length,
                failedUrls: result.failedUrls,
                postProcessingFailed: true,
              }
            }
          }
          return {
            opened: result.openedUrls.length,
            failedUrls: result.failedUrls,
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

  const retryFailedUrls = useCallback(async () => {
    const failures = openingOperation?.failedUrls ?? []
    if (failures.length === 0) {
      return
    }
    if (lastModeRef.current === 'single' && failures[0]) {
      await handleOpenTab(failures[0].url)
    } else {
      await handleOpenAllTabs(failures.map(({ url }) => ({ url, title: '' })))
    }
  }, [openingOperation, handleOpenTab, handleOpenAllTabs])

  return { handleOpenTab, handleOpenAllTabs, openingOperation, retryFailedUrls }
}
