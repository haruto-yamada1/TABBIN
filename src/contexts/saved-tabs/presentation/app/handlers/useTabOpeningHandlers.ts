import type { Dispatch, SetStateAction } from 'react'
import { useCallback, useId, useRef, useState } from 'react'

import type { SavedTabsUseCases } from '@/contexts/saved-tabs/application/createSavedTabsUseCases'
import { toBrowserOpenFailureReason } from '@/contexts/saved-tabs/application/errors/BrowserOpenError'
import type { BrowserOpenFailureReason } from '@/contexts/saved-tabs/application/errors/BrowserOpenError'
import { UrlOpeningPostProcessingError } from '@/contexts/saved-tabs/application/errors/UrlOpeningPostProcessingError'
import type { SavedTabsPresentationPorts } from '@/contexts/saved-tabs/application/ports/SavedTabsPresentationPorts'
import type { OpenAllSavedUrlsOptions } from '@/contexts/saved-tabs/application/use-cases/OpenAllSavedUrlsUseCase'
import type { OpenedUrlsUndoScope } from '@/contexts/saved-tabs/presentation/app/savedTabsApp.helpers'
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
  readonly status: 'running' | 'cancelling' | 'cancelled' | 'complete'
  readonly postProcessingFailed?: boolean
  readonly canCancel?: boolean
  readonly total: number
  readonly opened: number
  readonly failed?: number
  readonly cancelledUrls?: readonly string[]
  readonly failedUrls: readonly {
    readonly url: string
    readonly reason: BrowserOpenFailureReason
  }[]
}

type OpeningOutcome = Pick<
  UrlOpeningOperation,
  'opened' | 'failedUrls' | 'cancelledUrls' | 'postProcessingFailed'
>
type RetainedOpeningOutcome = OpeningOutcome & { readonly total: number }
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
  const [openingOperation, setOpeningOperation] =
    useState<UrlOpeningOperation | null>(null)
  const queueRef = useRef<Promise<void> | null>(null)
  const pendingRef = useRef<Map<string, Promise<void>> | null>(null)
  const operationRef = useRef<UrlOpeningOperation | null>(null)
  const activeRef = useRef<{
    readonly controller: AbortController
    readonly mode: 'single' | 'bulk'
  } | null>(null)
  const lastModeRef = useRef<'single' | 'bulk'>('single')
  const bulkUndoScopeRef = useRef<OpenedUrlsUndoScope | null>(null)
  const undoId = useId()
  const undoSequenceRef = useRef(0)
  const updateOperation = useCallback((operation: UrlOpeningOperation) => {
    operationRef.current = operation
    setOpeningOperation(operation)
  }, [])
  const cancelOpening = useCallback(() => {
    const active = activeRef.current
    if (active?.mode !== 'bulk') {
      return
    }
    active.controller.abort()
    const operation = operationRef.current
    if (operation?.status === 'running') {
      updateOperation({ ...operation, status: 'cancelling' })
    }
  }, [updateOperation])
  const runOpening = useCallback(
    async (
      urls: readonly string[],
      mode: 'single' | 'bulk',
      execute: (options: OpenAllSavedUrlsOptions) => Promise<OpeningOutcome>,
      retained?: RetainedOpeningOutcome,
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
      const active = { controller: new AbortController(), mode }
      // Register the front operation synchronously so an immediate cancel is kept.
      activeRef.current ??= active
      const operation = (queueRef.current ?? Promise.resolve())
        .then(async () => {
          activeRef.current = active
          lastModeRef.current = mode
          const total = retained?.total ?? urls.length
          const opened = retained?.opened ?? 0
          const failedUrls = retained?.failedUrls ?? []
          const cancelledUrls = retained?.cancelledUrls ?? []
          const finish = (outcome: OpeningOutcome) => {
            const failures = [...failedUrls, ...outcome.failedUrls]
            const unstarted = [
              ...cancelledUrls,
              ...(outcome.cancelledUrls ?? []),
            ]
            updateOperation({
              status:
                active.controller.signal.aborted || unstarted.length > 0
                  ? 'cancelled'
                  : 'complete',
              total,
              opened: opened + outcome.opened,
              failed: failures.length,
              failedUrls: failures,
              cancelledUrls: unstarted,
              postProcessingFailed:
                retained?.postProcessingFailed === true ||
                outcome.postProcessingFailed === true,
            })
          }
          updateOperation({
            status: active.controller.signal.aborted ? 'cancelling' : 'running',
            canCancel: mode === 'bulk',
            total,
            opened,
            failed: failedUrls.length,
            failedUrls,
            cancelledUrls,
          })
          try {
            const outcome = await execute({
              signal: active.controller.signal,
              onProgress: (progress) => {
                const current = operationRef.current
                if (
                  activeRef.current !== active ||
                  !current ||
                  (current.status !== 'running' &&
                    current.status !== 'cancelling')
                ) {
                  return
                }
                updateOperation({
                  ...current,
                  opened: opened + progress.opened,
                  failed: failedUrls.length + progress.failed,
                })
              },
            })
            finish(outcome)
          } catch (error) {
            if (error instanceof UrlOpeningPostProcessingError) {
              finish({
                opened: error.openedUrls.length,
                failedUrls: error.failedUrls,
                cancelledUrls: error.cancelledUrls,
                postProcessingFailed: true,
              })
            } else {
              finish({
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
          if (activeRef.current === active) {
            activeRef.current = null
          }
        })
      queueRef.current = operation
      pendingOperations.set(key, operation)
      return operation
    },
    [updateOperation],
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

  const openAllTabs = useCallback(
    async (urls: readonly OpeningUrl[], retained?: RetainedOpeningOutcome) => {
      const scope = (retained ? bulkUndoScopeRef.current : null) ?? {
        id: `${undoId}-bulk-${undoSequenceRef.current++}`,
        snapshot: undefined,
        removedCount: 0,
        pending: false,
        restoring: false,
      }
      if (scope.restoring) {
        return
      }
      scope.pending = true
      try {
        await runOpening(
          urls.map(({ url }) => url),
          'bulk',
          async (options) => {
            bulkUndoScopeRef.current = scope
            if (settings.removeTabAfterOpen && !scope.snapshot) {
              scope.snapshot = await savedTabsUseCases.buildSavedTabsSnapshot({
                parentCategories: toDomainParentCategories(categories),
              })
            }

            const result = await savedTabsUseCases.openAllSavedUrls(
              {
                mode: settings.openAllInNewWindow
                  ? 'newWindow'
                  : 'backgroundTabs',
                removeTabAfterOpen: settings.removeTabAfterOpen,
                urls: urls.map((u) => u.url),
              },
              options,
            )

            if (
              settings.removeTabAfterOpen &&
              scope.snapshot &&
              result.snapshot
            ) {
              scope.removedCount += result.removedUrlRecordIds.length
              try {
                await refreshTabGroupsWithUrls()
                showOpenedUrlsUndoToast({
                  count: scope.removedCount,
                  scope,
                  refreshTabGroupsWithUrls,
                  savedTabsUseCases,
                  setCustomProjects,
                  snapshot: scope.snapshot,
                  t,
                })
              } catch {
                return {
                  opened: result.openedUrls.length,
                  failedUrls: result.failedUrls,
                  cancelledUrls: result.cancelledUrls ?? [],
                  postProcessingFailed: true,
                }
              }
            }
            return {
              opened: result.openedUrls.length,
              failedUrls: result.failedUrls,
              cancelledUrls: result.cancelledUrls ?? [],
            }
          },
          retained,
        )
      } finally {
        scope.pending = false
      }
    },
    [
      runOpening,
      undoId,
      settings.openAllInNewWindow,
      settings.removeTabAfterOpen,
      savedTabsUseCases,
      categories,
      refreshTabGroupsWithUrls,
      setCustomProjects,
      t,
    ],
  )

  const handleOpenAllTabs = useCallback(
    async (urls: readonly OpeningUrl[]) => {
      await openAllTabs(urls)
    },
    [openAllTabs],
  )
  const retryFailedUrls = useCallback(async () => {
    const operation = operationRef.current
    const failures = operation?.failedUrls ?? []
    if (!operation || failures.length === 0 || pendingRef.current?.size) {
      return
    }
    if (lastModeRef.current === 'single' && failures[0]) {
      await handleOpenTab(failures[0].url)
    } else {
      await openAllTabs(
        failures.map(({ url }) => ({ url, title: '' })),
        { ...operation, failedUrls: [] },
      )
    }
  }, [handleOpenTab, openAllTabs])

  const resumeCancelledUrls = useCallback(async () => {
    const operation = operationRef.current
    const cancelled = operation?.cancelledUrls ?? []
    if (!operation || cancelled.length === 0 || pendingRef.current?.size) {
      return
    }
    await openAllTabs(
      cancelled.map((url) => ({ url, title: '' })),
      { ...operation, cancelledUrls: [] },
    )
  }, [openAllTabs])

  return {
    handleOpenTab,
    handleOpenAllTabs,
    openingOperation,
    retryFailedUrls,
    cancelOpening,
    resumeCancelledUrls,
  }
}
