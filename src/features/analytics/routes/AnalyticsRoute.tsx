import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import { Card } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Toaster } from '@/components/ui/sonner'
import { AiChartRenderer } from '@/features/ai-chat/components/AiChartRenderer'
import type { AiChartPointSelection } from '@/features/ai-chat/components/AiChartRenderer'
import { LazySavedTabsChatWidget } from '@/features/ai-chat/components/LazySavedTabsChatWidget'
import type {
  AiChartSpec,
  AiChatConversationMessage,
  AiSavedUrlRecord,
} from '@/features/ai-chat/types'
import {
  filterAnalyticsRecords,
  generateAnalyticsResult,
  getDefaultAnalyticsQuery,
} from '@/features/analytics/lib/analytics'
import type { AnalyticsQuery } from '@/features/analytics/lib/analytics'
import { loadAnalyticsRecords } from '@/features/analytics/lib/loadAnalyticsRecords'
import { AnalyticsDialogs } from '@/features/analytics/routes/AnalyticsDialogs'
import { AnalyticsDrilldownPanel } from '@/features/analytics/routes/AnalyticsDrilldownPanel'
import type {
  AnalyticsChartMessages,
  AnalyticsDeleteUndoSnapshot,
  AnalyticsDrilldownSelection,
  DeleteAllAction,
  DeleteClickAction,
  OpenAllAction,
  ViewNameValidationError,
} from '@/features/analytics/routes/analyticsRoute.helpers'
import {
  awaitableEmptyRecords,
  createAnalyticsDeleteUndoPayload,
  getAnalyticsDeleteUndoSnapshot,
  getDeleteAllAction,
  getDeleteClickAction,
  getDrilldownMatchingRecords,
  getLatestAssistantCharts,
  getNextBulkDeleteDialogOpen,
  getNextDeleteTargetAfterDialogOpenChange,
  getOpenAllAction,
  getViewNameValidationError,
  matchesDrilldownLabel,
  noop,
  normalizeAnalyticsRouteQuery,
  rebuildAnalyticsDrilldownSelection,
  removeUrlFromStorage,
  removeUrlRecordsFromStorage,
  runBulkDeleteWhenAllowed,
  runConfirmedDelete,
  runSingleDeleteWhenAllowed,
} from '@/features/analytics/routes/analyticsRoute.helpers'
import { AnalyticsSidebar } from '@/features/analytics/routes/AnalyticsSidebar'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import {
  getChromeStorageLocal,
  warnMissingChromeStorage,
} from '@/lib/browser/chrome-storage'
import {
  createSavedAnalyticsView,
  deleteSavedAnalyticsView,
  loadSavedAnalyticsViews,
  saveSavedAnalyticsViews,
} from '@/lib/storage/analytics'
import type { SavedAnalyticsView } from '@/lib/storage/analytics'
import { defaultSettings, getUserSettings } from '@/lib/storage/settings'

const defaultAnalyticsQuery = getDefaultAnalyticsQuery()

const CanvasPane = ({
  aiChartSpecs,
  deletingUrl,
  drilldownSelection,
  generatedChartSpecs,
  handleChartPointClick,
  handleDeleteAllClick,
  handleDeleteClick,
  handleOpenAllClick,
  isDeleteActionDisabled,
  isUsingAiCharts,
  language,
  summary,
  t,
}: {
  aiChartSpecs: AiChartSpec[]
  deletingUrl: string | null
  drilldownSelection: AnalyticsDrilldownSelection | null
  generatedChartSpecs: {
    charts: AiChartSpec[]
    summary: string
  }
  handleChartPointClick: (selection: AiChartPointSelection) => void
  handleDeleteAllClick: () => void
  handleDeleteClick: (record: AiSavedUrlRecord) => void
  handleOpenAllClick: () => void
  isDeleteActionDisabled: boolean
  isUsingAiCharts: boolean
  language: string
  summary: string
  t: (key: string) => string
}) => (
  <ScrollArea
    className='min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain rounded-3xl border border-border bg-card shadow-none'
    data-testid='analytics-canvas-pane'
  >
    <div className='min-w-0 p-5'>
      <div className='flex flex-wrap items-start justify-between gap-3'>
        <div>
          <h2 className='text-lg font-semibold'>
            {t('analytics.canvasTitle')}
          </h2>
          <p className='mt-1 text-sm text-muted-foreground'>{summary}</p>
        </div>
      </div>
      <div
        className='sticky top-0 z-10 min-w-0 bg-card/95 pb-4 backdrop-blur supports-backdrop-filter:bg-card/80'
        data-testid='analytics-sticky-chart-panel'
      >
        <Card className='min-w-0 rounded-3xl border-dashed bg-background/70 p-4 shadow-none'>
          <AiChartRenderer
            charts={
              isUsingAiCharts && aiChartSpecs.length > 0
                ? aiChartSpecs
                : generatedChartSpecs.charts
            }
            onChartPointClick={handleChartPointClick}
          />
        </Card>
      </div>
      <AnalyticsDrilldownPanel
        deletingUrl={deletingUrl}
        drilldownSelection={drilldownSelection}
        isDeleteActionDisabled={isDeleteActionDisabled}
        language={language}
        onDeleteAllClick={handleDeleteAllClick}
        onDeleteClick={handleDeleteClick}
        onOpenAllClick={handleOpenAllClick}
      />
    </div>
  </ScrollArea>
)

const useAnalyticsRouteOptions = (t: (key: string) => string) => {
  const chartMessages = useMemo<AnalyticsChartMessages>(
    () => ({
      chartDailySavedTrend: t('analytics.chart.dailySavedTrend'),
      chartDescriptionAggregated: t('analytics.chart.descriptionAggregated'),
      chartDescriptionCompareMode: t('analytics.chart.descriptionCompareMode'),
      chartMonthlySavedTrend: t('analytics.chart.monthlySavedTrend'),
      chartSavedCountByDomain: t('analytics.chart.savedCountByDomain'),
      chartSavedCountByParentCategory: t(
        'analytics.chart.savedCountByParentCategory',
      ),
      chartSavedCountByProject: t('analytics.chart.savedCountByProject'),
      chartSavedCountByProjectCategory: t(
        'analytics.chart.savedCountByProjectCategory',
      ),
      chartSavedCountBySubCategory: t(
        'analytics.chart.savedCountBySubCategory',
      ),
      chartSeriesCustomMode: t('analytics.chart.seriesCustomMode'),
      chartSeriesDomainMode: t('analytics.chart.seriesDomainMode'),
      chartSeriesSavedCount: t('analytics.chart.seriesSavedCount'),
      chartSeriesShare: t('analytics.chart.seriesShare'),
      chartSummary: t('analytics.summary'),
      chartWeeklySavedTrend: t('analytics.chart.weeklySavedTrend'),
      uncategorizedLabel: t('analytics.uncategorized'),
    }),
    [t],
  )
  const analyticsGroupByOptions = [
    { label: t('analytics.groupBy.domain'), value: 'domain' },
    { label: t('analytics.groupBy.timeRecent'), value: 'timeRecent' },
    { label: t('analytics.groupBy.timeTop'), value: 'timeTop' },
    { label: t('analytics.groupBy.parentCategory'), value: 'parentCategory' },
    { label: t('analytics.groupBy.subCategory'), value: 'subCategory' },
    { label: t('analytics.groupBy.project'), value: 'project' },
  ] as const satisfies readonly {
    label: string
    value: AnalyticsQuery['groupBy']
  }[]
  const analyticsChartTypeOptions = [
    { label: t('analytics.chartType.bar'), value: 'bar' },
    { label: t('analytics.chartType.line'), value: 'line' },
    { label: t('analytics.chartType.area'), value: 'area' },
    { label: t('analytics.chartType.pie'), value: 'pie' },
    { label: t('analytics.chartType.radar'), value: 'radar' },
  ] as const satisfies readonly {
    label: string
    value: AnalyticsQuery['chartType']
  }[]
  return { analyticsChartTypeOptions, analyticsGroupByOptions, chartMessages }
}

const useAnalyticsRouteView = () => {
  const { language, t } = useI18n()
  const [analyticsData, setAnalyticsData] = useState<{
    records: typeof awaitableEmptyRecords
    savedViews: SavedAnalyticsView[]
    settings: typeof defaultSettings
  }>(() => ({
    records: awaitableEmptyRecords,
    savedViews: [],
    settings: defaultSettings,
  }))
  const { records, savedViews, settings } = analyticsData
  const setRecords = (records: typeof awaitableEmptyRecords) => {
    setAnalyticsData((current) => ({ ...current, records }))
  }
  const setSavedViews = (savedViews: SavedAnalyticsView[]) => {
    setAnalyticsData((current) => ({ ...current, savedViews }))
  }
  const [query, setQuery] = useState<AnalyticsQuery>(() =>
    normalizeAnalyticsRouteQuery(defaultAnalyticsQuery),
  )
  const [viewName, setViewName] = useState('')
  const [viewNameError, setViewNameError] =
    useState<ViewNameValidationError | null>(null)
  const [aiChartSpecs, setAiChartSpecs] = useState<AiChartSpec[]>([])
  const [drilldownSelection, setDrilldownSelection] =
    useState<AnalyticsDrilldownSelection | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AiSavedUrlRecord | null>(
    null,
  )
  const [deletingUrl, setDeletingUrl] = useState<string | null>(null)
  const [isBulkDeleteConfirmOpen, setIsBulkDeleteConfirmOpen] = useState(false)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [isOpenAllConfirmOpen, setIsOpenAllConfirmOpen] = useState(false)
  const [isUsingAiCharts, setIsUsingAiCharts] = useState(false)
  const { analyticsChartTypeOptions, analyticsGroupByOptions, chartMessages } =
    useAnalyticsRouteOptions(t)

  useEffect(() => {
    let cancelled = false

    void Promise.all([
      loadAnalyticsRecords(),
      loadSavedAnalyticsViews(),
      getUserSettings(),
    ]).then(([nextRecords, nextSavedViews, nextSettings]) => {
      if (cancelled) {
        return
      }

      setAnalyticsData({
        records: nextRecords,
        savedViews: nextSavedViews,
        settings: nextSettings,
      })
    })

    return () => {
      cancelled = true
    }
  }, [])

  const generatedAnalyticsResult = useMemo(
    () =>
      generateAnalyticsResult(records, query, {
        messages: chartMessages,
      }),
    [chartMessages, query, records],
  )
  const generatedChartSpecs = generatedAnalyticsResult.chartSpecs
  const canvasChartSpecs = useMemo(
    () => ({
      charts: generatedChartSpecs,
      summary: generatedAnalyticsResult.summary,
    }),
    [generatedChartSpecs, generatedAnalyticsResult.summary],
  )
  const summary = isUsingAiCharts
    ? t('analytics.aiSummary')
    : generatedAnalyticsResult.summary

  const filteredRecords = useMemo(
    () =>
      filterAnalyticsRecords(records, query, {
        messages: chartMessages,
      }),
    [chartMessages, query, records],
  )

  const applyQuery = useCallback(
    (nextQuery: AnalyticsQuery, nextViewName?: string) => {
      setIsUsingAiCharts(false)
      setAiChartSpecs([])
      setDrilldownSelection(null)
      setQuery(normalizeAnalyticsRouteQuery(nextQuery))
      if (nextViewName) {
        setViewName(nextViewName)
      }
    },
    [],
  )

  const handleSaveView = useCallback(async () => {
    const trimmedName = viewName.trim()
    const nextError = getViewNameValidationError({
      savedViews,
      viewName,
    })
    if (nextError) {
      setViewNameError(nextError)
      return
    }

    setViewNameError(null)
    const nextView = createSavedAnalyticsView({
      name: trimmedName,
      query,
    })
    const nextViews = [...savedViews, nextView]
    setSavedViews(nextViews)
    await saveSavedAnalyticsViews(nextViews)
    setViewName('')
  }, [viewName, savedViews, query])

  const handleDeleteView = useCallback(
    async (viewId: string) => {
      const nextViews = savedViews.filter((view) => view.id !== viewId)
      setSavedViews(nextViews)
      await deleteSavedAnalyticsView(viewId)
    },
    [savedViews],
  )

  const handleMessagesChange = useCallback(
    (messages: AiChatConversationMessage[]) => {
      const latestAssistantCharts = getLatestAssistantCharts(messages)
      if (!latestAssistantCharts) {
        return
      }

      if (latestAssistantCharts.query) {
        setQuery(normalizeAnalyticsRouteQuery(latestAssistantCharts.query))
      }
      setIsUsingAiCharts(true)
      setAiChartSpecs(latestAssistantCharts.charts)
      setDrilldownSelection(null)
    },
    [],
  )

  const handleChartPointClick = useCallback(
    ({ label, seriesKey, spec }: AiChartPointSelection) => {
      const matchingRecords = filteredRecords.filter((record) =>
        matchesDrilldownLabel({
          chartMessages,
          label,
          query,
          record,
          seriesKey,
          uncategorizedLabel: t('analytics.uncategorized'),
        }),
      )

      setDrilldownSelection({
        label,
        matchingRecords,
        seriesKey,
        specTitle: spec.title,
      })
    },
    [filteredRecords, chartMessages, query, t],
  )

  const refreshRecords = useCallback(async () => {
    const nextRecords = await loadAnalyticsRecords()
    setRecords(nextRecords)
    return nextRecords
  }, [])

  const rebuildDrilldownSelection = useCallback(
    (nextRecords: AiSavedUrlRecord[]) => {
      setDrilldownSelection((currentSelection) =>
        rebuildAnalyticsDrilldownSelection({
          chartMessages,
          currentSelection,
          nextRecords,
          query,
          uncategorizedLabel: t('analytics.uncategorized'),
        }),
      )
    },
    [chartMessages, query, t],
  )

  const showDeleteUndoToast = useCallback(
    ({
      count,
      snapshot,
    }: {
      count: number
      snapshot: AnalyticsDeleteUndoSnapshot
    }) => {
      toast.info(
        t('savedTabs.undo.deletedTabs', undefined, {
          count: String(count),
        }),
        {
          action: {
            label: t('common.undo'),
            // eslint-disable-next-line typescript/no-misused-promises
            onClick: async () => {
              try {
                const storageLocal = getChromeStorageLocal()
                if (storageLocal) {
                  await storageLocal.set(
                    createAnalyticsDeleteUndoPayload(snapshot),
                  )
                } else {
                  warnMissingChromeStorage('分析削除アンドゥ復元')
                }
                const nextRecords = await refreshRecords()
                rebuildDrilldownSelection(nextRecords)
                toast.success(t('savedTabs.undo.restored'))
              } catch (error) {
                console.error(
                  'Failed to restore analytics drilldown urls:',
                  error,
                )
                toast.error(t('savedTabs.undo.restoreError'))
              }
            },
          },
        },
      )
    },
    [t, refreshRecords, rebuildDrilldownSelection],
  )

  const performDelete = useCallback(
    async (record: AiSavedUrlRecord) => {
      await runSingleDeleteWhenAllowed({
        deletingUrl,
        isBulkDeleting,
        onRun: async () => {
          try {
            setDeletingUrl(record.url)
            const undoSnapshot = await getAnalyticsDeleteUndoSnapshot()
            const nextRecords = await removeUrlFromStorage(record.url).then(
              async () => refreshRecords(),
            )
            rebuildDrilldownSelection(nextRecords)
            showDeleteUndoToast({
              count: 1,
              snapshot: undoSnapshot,
            })
          } catch (error) {
            console.error('Failed to delete analytics drilldown url:', error)
            toast.error(t('savedTabs.tab.deleteError'))
          } finally {
            setDeletingUrl(null)
            setDeleteTarget(null)
          }
        },
      })
    },
    [
      deletingUrl,
      isBulkDeleting,
      refreshRecords,
      rebuildDrilldownSelection,
      showDeleteUndoToast,
      t,
    ],
  )

  const handleDeleteClick = useCallback(
    (record: AiSavedUrlRecord) => {
      const action = getDeleteClickAction({
        confirmDeleteEach: settings.confirmDeleteEach,
        deletingUrl,
        isBulkDeleting,
      })
      const actions: Record<DeleteClickAction, () => void> = {
        confirm: () => {
          setDeleteTarget(record)
        },
        delete: () => {
          void performDelete(record)
        },
        skip: noop,
      }
      actions[action]()
    },
    [settings, deletingUrl, isBulkDeleting, performDelete],
  )

  const handleOpenAllDrilldownRecords = useCallback(() => {
    const matchingRecords = getDrilldownMatchingRecords(drilldownSelection)
    for (const record of matchingRecords) {
      window.open(record.url, '_blank', 'noopener,noreferrer')
    }
  }, [drilldownSelection])

  const handleOpenAllClick = useCallback(() => {
    const action = getOpenAllAction(
      getDrilldownMatchingRecords(drilldownSelection).length,
    )
    const actions: Record<OpenAllAction, () => void> = {
      confirm: () => {
        setIsOpenAllConfirmOpen(true)
      },
      open: handleOpenAllDrilldownRecords,
      skip: noop,
    }
    actions[action]()
  }, [drilldownSelection, handleOpenAllDrilldownRecords])

  const performBulkDelete = useCallback(async () => {
    const matchingRecords = getDrilldownMatchingRecords(drilldownSelection)
    await runBulkDeleteWhenAllowed({
      deletingUrl,
      isBulkDeleting,
      matchingRecordCount: matchingRecords.length,
      onRun: async () => {
        try {
          setIsBulkDeleting(true)
          const undoSnapshot = await getAnalyticsDeleteUndoSnapshot()
          const nextRecords = await removeUrlRecordsFromStorage(
            matchingRecords.map((record) => record.id),
          ).then(async () => refreshRecords())
          rebuildDrilldownSelection(nextRecords)
          showDeleteUndoToast({
            count: matchingRecords.length,
            snapshot: undoSnapshot,
          })
        } catch (error) {
          console.error(
            'Failed to bulk delete analytics drilldown urls:',
            error,
          )
          toast.error(t('analytics.deleteTabsError'))
        } finally {
          setIsBulkDeleting(false)
          setIsBulkDeleteConfirmOpen(false)
        }
      },
    })
  }, [
    drilldownSelection,
    deletingUrl,
    isBulkDeleting,
    refreshRecords,
    rebuildDrilldownSelection,
    showDeleteUndoToast,
    t,
  ])

  const handleDeleteAllClick = useCallback(() => {
    const action = getDeleteAllAction({
      confirmDeleteAll: settings.confirmDeleteAll,
      deletingUrl,
      isBulkDeleting,
      matchingRecordCount:
        getDrilldownMatchingRecords(drilldownSelection).length,
    })
    const actions: Record<DeleteAllAction, () => void> = {
      confirm: () => {
        setIsBulkDeleteConfirmOpen(true)
      },
      delete: () => {
        void performBulkDelete()
      },
      skip: noop,
    }
    actions[action]()
  }, [
    settings,
    deletingUrl,
    isBulkDeleting,
    drilldownSelection,
    performBulkDelete,
  ])

  const isDeleteActionDisabled = deletingUrl !== null || isBulkDeleting

  const handleResetQuery = useCallback(() => {
    applyQuery(defaultAnalyticsQuery)
  }, [applyQuery])

  const handleViewNameChange = useCallback(
    (value: string) => {
      setViewName(value)
      setViewNameError((currentError) =>
        currentError
          ? getViewNameValidationError({ savedViews, viewName: value })
          : currentError,
      )
    },
    [savedViews],
  )

  const handleBulkDeleteConfirmOpenChange = useCallback(
    (isOpen: boolean) => {
      setIsBulkDeleteConfirmOpen((currentOpen) =>
        getNextBulkDeleteDialogOpen({
          currentOpen,
          isBulkDeleting,
          isOpen,
        }),
      )
    },
    [isBulkDeleting],
  )

  const handleDeleteTargetChange = useCallback(
    (isOpen: boolean) => {
      setDeleteTarget((currentTarget) =>
        getNextDeleteTargetAfterDialogOpenChange({
          currentTarget,
          deletingUrl,
          isOpen,
        }),
      )
    },
    [deletingUrl],
  )

  const handleRunConfirmedDelete = useCallback(() => {
    runConfirmedDelete(deleteTarget, performDelete)
  }, [deleteTarget, performDelete])

  return (
    <div
      className='flex h-screen min-h-0 min-w-0 items-stretch overflow-hidden bg-background'
      data-testid='analytics-page-layout'
    >
      <main className='min-h-0 min-w-0 flex-1 overflow-hidden bg-muted/10'>
        <div className='mx-auto flex h-full min-h-0 max-w-7xl min-w-0 flex-col gap-4'>
          <section
            className='grid min-h-0 min-w-0 flex-1 gap-4 lg:grid-cols-[240px_minmax(0,1fr)]'
            data-testid='analytics-layout-grid'
          >
            <AnalyticsSidebar
              analyticsChartTypeOptions={analyticsChartTypeOptions}
              analyticsGroupByOptions={analyticsGroupByOptions}
              onApplyQuery={applyQuery}
              // eslint-disable-next-line typescript/no-misused-promises
              onDeleteView={handleDeleteView}
              onResetQuery={handleResetQuery}
              // eslint-disable-next-line typescript/no-misused-promises
              onSaveView={handleSaveView}
              onViewNameChange={handleViewNameChange}
              query={query}
              savedViews={savedViews}
              viewName={viewName}
              viewNameError={viewNameError}
            />

            <CanvasPane
              aiChartSpecs={aiChartSpecs}
              deletingUrl={deletingUrl}
              drilldownSelection={drilldownSelection}
              generatedChartSpecs={canvasChartSpecs}
              handleChartPointClick={handleChartPointClick}
              handleDeleteAllClick={handleDeleteAllClick}
              handleDeleteClick={handleDeleteClick}
              handleOpenAllClick={handleOpenAllClick}
              isDeleteActionDisabled={isDeleteActionDisabled}
              isUsingAiCharts={isUsingAiCharts}
              language={language}
              summary={summary}
              t={t}
            />
          </section>
        </div>
      </main>

      <LazySavedTabsChatWidget
        historyVariant='dropdown'
        onMessagesChange={handleMessagesChange}
      />

      <Toaster />

      <AnalyticsDialogs
        deleteTarget={deleteTarget}
        isBulkDeleteConfirmOpen={isBulkDeleteConfirmOpen}
        isOpenAllConfirmOpen={isOpenAllConfirmOpen}
        onBulkDeleteConfirmOpenChange={handleBulkDeleteConfirmOpenChange}
        onDeleteTargetChange={handleDeleteTargetChange}
        onOpenAllConfirmOpenChange={setIsOpenAllConfirmOpen}
        onOpenAllDrilldownRecords={handleOpenAllDrilldownRecords}
        // eslint-disable-next-line typescript/no-misused-promises
        onPerformBulkDelete={performBulkDelete}
        onRunConfirmedDelete={handleRunConfirmedDelete}
      />
    </div>
  )
}

const AnalyticsRoute = () => useAnalyticsRouteView()

export { AnalyticsRoute }
