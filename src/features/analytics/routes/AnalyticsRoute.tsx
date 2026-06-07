import { ExternalLink, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties } from 'react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Toaster } from '@/components/ui/sonner'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
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
  normalizeAnalyticsQuery,
} from '@/features/analytics/lib/analytics'
import type { AnalyticsQuery } from '@/features/analytics/lib/analytics'
import { loadAnalyticsRecords } from '@/features/analytics/lib/loadAnalyticsRecords'
import { AnalyticsRecordActionButtons } from '@/features/analytics/routes/AnalyticsRecordActionButtons'
import { useI18n } from '@/features/i18n/context/I18nProvider'
import {
  createSavedAnalyticsView,
  deleteSavedAnalyticsView,
  loadSavedAnalyticsViews,
  saveSavedAnalyticsViews,
} from '@/lib/storage/analytics'
import type { SavedAnalyticsView } from '@/lib/storage/analytics'
import { defaultSettings, getUserSettings } from '@/lib/storage/settings'
import type { AiChatToolTrace } from '@/types/background'
import type {
  CustomProject,
  ParentCategory,
  TabGroup,
  UrlRecord,
} from '@/types/storage'
import { formatLocaleDateTime } from '@/utils/localDateTime'

const defaultAnalyticsQuery = getDefaultAnalyticsQuery()
const deferredDrilldownCardStyle: CSSProperties = {
  containIntrinsicSize: '96px',
  contentVisibility: 'auto',
}

const isAnalyticsQuery = (value: unknown): value is AnalyticsQuery => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const query = value as Partial<AnalyticsQuery>
  return (
    typeof query.chartType === 'string' &&
    typeof query.groupBy === 'string' &&
    typeof query.mode === 'string'
  )
}

const getLatestAnalyticsQuery = (
  toolTraces: AiChatToolTrace[] | undefined,
): AnalyticsQuery | null => {
  if (!toolTraces) {
    return null
  }

  for (const toolTrace of [...toolTraces].toReversed()) {
    if (toolTrace.toolName !== 'generateSavedTabsAnalytics') {
      continue
    }

    const output =
      toolTrace.output && typeof toolTrace.output === 'object'
// eslint-disable-next-line typescript/no-unsafe-type-assertion
        ? (toolTrace.output as Record<string, unknown>)
        : null
    if (!output) {
      continue
    }

    const { query } = output
    if (isAnalyticsQuery(query)) {
      return query
    }
  }

  return null
}

const getLatestAssistantCharts = (
  messages: AiChatConversationMessage[],
): {
  charts: AiChartSpec[]
  query: AnalyticsQuery | null
} | null => {
  for (const message of [...messages].toReversed()) {
    if (message.role !== 'assistant' || !message.charts?.length) {
      continue
    }

    return {
      charts: message.charts,
      query: getLatestAnalyticsQuery(message.toolTraces),
    }
  }

  return null
}

const awaitableEmptyRecords: Awaited<ReturnType<typeof loadAnalyticsRecords>> =
  []

const shouldConfirmBulkOpen = (recordCount: number): boolean =>
// eslint-disable-next-line eslint/no-magic-numbers
  recordCount >= 10
const noop = (): void => {}

const shouldSkipSingleDelete = ({
  deletingUrl,
  isBulkDeleting,
}: {
  deletingUrl: string | null
  isBulkDeleting: boolean
// eslint-disable-next-line typescript/prefer-nullish-coalescing
}): boolean => Boolean(deletingUrl || isBulkDeleting)

const shouldSkipOpenAll = (recordCount: number): boolean => recordCount === 0

const shouldSkipBulkDelete = ({
  deletingUrl,
  isBulkDeleting,
  matchingRecordCount,
}: {
  deletingUrl: string | null
  isBulkDeleting: boolean
  matchingRecordCount: number
}): boolean =>
// eslint-disable-next-line typescript/prefer-nullish-coalescing
  matchingRecordCount === 0 || Boolean(deletingUrl || isBulkDeleting)

const shouldIgnoreBulkDeleteDialogClose = ({
  isBulkDeleting,
  isOpen,
}: {
  isBulkDeleting: boolean
  isOpen: boolean
}): boolean => !isOpen && isBulkDeleting

const shouldIgnoreSingleDeleteDialogClose = ({
  deletingUrl,
  isOpen,
}: {
  deletingUrl: string | null
  isOpen: boolean
}): boolean => !isOpen && Boolean(deletingUrl)

const getDrilldownMatchingRecords = (
  selection: AnalyticsDrilldownSelection | null,
): AiSavedUrlRecord[] => selection?.matchingRecords ?? []

const runSingleDeleteWhenAllowed = async ({
  deletingUrl,
  isBulkDeleting,
  onRun,
}: {
  deletingUrl: string | null
  isBulkDeleting: boolean
  onRun: () => Promise<void>
}): Promise<boolean> => {
  if (shouldSkipSingleDelete({ deletingUrl, isBulkDeleting })) {
    return false
  }

  await onRun()
  return true
}

const runBulkDeleteWhenAllowed = async ({
  deletingUrl,
  isBulkDeleting,
  matchingRecordCount,
  onRun,
}: {
  deletingUrl: string | null
  isBulkDeleting: boolean
  matchingRecordCount: number
  onRun: () => Promise<void>
}): Promise<boolean> => {
  if (
    shouldSkipBulkDelete({
      deletingUrl,
      isBulkDeleting,
      matchingRecordCount,
    })
  ) {
    return false
  }

  await onRun()
  return true
}

type DeleteClickAction = 'confirm' | 'delete' | 'skip'
const getDeleteClickAction = ({
  confirmDeleteEach,
  deletingUrl,
  isBulkDeleting,
}: {
  confirmDeleteEach: boolean
  deletingUrl: string | null
  isBulkDeleting: boolean
}): DeleteClickAction => {
  if (shouldSkipSingleDelete({ deletingUrl, isBulkDeleting })) {
    return 'skip'
  }

  return confirmDeleteEach ? 'confirm' : 'delete'
}

type OpenAllAction = 'confirm' | 'open' | 'skip'
const getOpenAllAction = (recordCount: number): OpenAllAction => {
  if (shouldSkipOpenAll(recordCount)) {
    return 'skip'
  }

  return shouldConfirmBulkOpen(recordCount) ? 'confirm' : 'open'
}

type DeleteAllAction = 'confirm' | 'delete' | 'skip'
const getDeleteAllAction = ({
  confirmDeleteAll,
  deletingUrl,
  isBulkDeleting,
  matchingRecordCount,
}: {
  confirmDeleteAll: boolean
  deletingUrl: string | null
  isBulkDeleting: boolean
  matchingRecordCount: number
}): DeleteAllAction => {
  if (
    shouldSkipBulkDelete({
      deletingUrl,
      isBulkDeleting,
      matchingRecordCount,
    })
  ) {
    return 'skip'
  }

  return confirmDeleteAll ? 'confirm' : 'delete'
}

const getNextBulkDeleteDialogOpen = ({
  currentOpen,
  isBulkDeleting,
  isOpen,
}: {
  currentOpen: boolean
  isBulkDeleting: boolean
  isOpen: boolean
}): boolean =>
  shouldIgnoreBulkDeleteDialogClose({ isBulkDeleting, isOpen })
    ? currentOpen
    : isOpen

const getNextDeleteTargetAfterDialogOpenChange = ({
  currentTarget,
  deletingUrl,
  isOpen,
}: {
  currentTarget: AiSavedUrlRecord | null
  deletingUrl: string | null
  isOpen: boolean
}): AiSavedUrlRecord | null => {
  if (shouldIgnoreSingleDeleteDialogClose({ deletingUrl, isOpen })) {
    return currentTarget
  }

  if (isOpen) {
    return currentTarget
  }

  return null
}

const removeUrlFromStorage = async (url: string): Promise<void> =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: 'removeUrlFromStorage',
        url,
      },
      (response?: { error?: string; status?: string }) => {
        if (response?.status === 'removed') {
          resolve()
          return
        }

// eslint-disable-next-line typescript/prefer-nullish-coalescing
        reject(new Error(response?.error || 'removeUrlFromStorage failed'))
      },
    )
  })

const getAnalyticsDateLocale = (language: string): 'en-US' | 'ja-JP' =>
  language === 'ja' ? 'ja-JP' : 'en-US'

const removeUrlRecordsFromStorage = async (urlIds: string[]): Promise<void> =>
  new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: 'removeUrlRecordsFromStorage',
        urlIds,
      },
      (response?: { error?: string; status?: string }) => {
        if (response?.status === 'removed') {
          resolve()
          return
        }

        reject(
// eslint-disable-next-line typescript/prefer-nullish-coalescing
          new Error(response?.error || 'removeUrlRecordsFromStorage failed'),
        )
      },
    )
  })

interface AnalyticsDeleteUndoSnapshot {
  customProjectOrder?: string[]
  customProjects?: CustomProject[]
  parentCategories?: ParentCategory[]
  savedTabs?: TabGroup[]
  urls?: UrlRecord[]
}

interface AnalyticsDeleteUndoPayload {
  customProjectOrder?: string[]
  customProjects?: CustomProject[]
  parentCategories?: ParentCategory[]
  savedTabs?: TabGroup[]
  urls?: UrlRecord[]
}

const getAnalyticsDeleteUndoSnapshot =
  async (): Promise<AnalyticsDeleteUndoSnapshot> =>
    chrome.storage.local.get<AnalyticsDeleteUndoSnapshot>([
      'savedTabs',
      'customProjects',
      'customProjectOrder',
      'parentCategories',
      'urls',
    ])

const getSnapshotArray = <T,>(value: T[] | undefined): T[] | undefined =>
  Array.isArray(value) ? value : undefined
const createAnalyticsDeleteUndoPayload = (
  snapshot: AnalyticsDeleteUndoSnapshot,
): AnalyticsDeleteUndoPayload => {
  const payload: AnalyticsDeleteUndoPayload = {}
  const savedTabs = getSnapshotArray(snapshot.savedTabs)
  const customProjects = getSnapshotArray(snapshot.customProjects)
  const customProjectOrder = getSnapshotArray(snapshot.customProjectOrder)
  const parentCategories = getSnapshotArray(snapshot.parentCategories)
  const urls = getSnapshotArray(snapshot.urls)

  if (savedTabs) {
    payload.savedTabs = savedTabs
  }
  if (customProjects) {
    payload.customProjects = customProjects
  }
  if (customProjectOrder) {
    payload.customProjectOrder = customProjectOrder
  }
  if (parentCategories) {
    payload.parentCategories = parentCategories
  }
  if (urls) {
    payload.urls = urls
  }

  return payload
}

const normalizeAnalyticsRouteQuery = (
  analyticsQuery: AnalyticsQuery,
): AnalyticsQuery => ({
  ...normalizeAnalyticsQuery(analyticsQuery),
  mode: 'both',
})

interface AnalyticsDrilldownSelection {
  label: string
  matchingRecords: AiSavedUrlRecord[]
  seriesKey?: string
  specTitle: string
}

type ViewNameValidationError = 'duplicate' | 'required'

type AnalyticsChartMessages = NonNullable<
  Parameters<typeof generateAnalyticsResult>[2]
>['messages']

const getAnalyticsChartDatumLabels = (
  data: { label?: unknown }[] | undefined,
): string[] =>
  data?.reduce<string[]>((items, datum) => {
    const label = String(datum.label ?? '')
    if (label) {
      items.push(label)
    }
    return items
  }, []) ?? []

const getDrilldownLabelsForRecord = (
  record: AiSavedUrlRecord,
  query: AnalyticsQuery,
  uncategorizedLabel: string,
  chartMessages: AnalyticsChartMessages,
): string[] => {
  switch (query.groupBy) {
    case 'timeRecent':
    case 'timeTop': {
      return getAnalyticsChartDatumLabels(
        generateAnalyticsResult(
          [record],
          {
            ...query,
            compareBy: 'none',
          },
          { messages: chartMessages },
        ).chartSpecs[0]?.data,
      )
    }
    case 'parentCategory': {
      return record.parentCategories.length > 0
        ? record.parentCategories
        : [uncategorizedLabel]
    }
    case 'subCategory': {
      return record.subCategories.length > 0
        ? record.subCategories
        : [uncategorizedLabel]
    }
    case 'project': {
      return record.savedInProjects.length > 0
        ? record.savedInProjects
        : [uncategorizedLabel]
    }
    case 'projectCategory': {
      return record.projectCategories.length > 0
        ? record.projectCategories
        : [uncategorizedLabel]
    }
    default: {
      return [record.domain]
    }
  }
}

const matchesDrilldownMode = ({
  record,
  query,
  seriesKey,
}: {
  record: AiSavedUrlRecord
  query: AnalyticsQuery
  seriesKey?: string
}): boolean => {
  if (query.compareBy !== 'mode' || !seriesKey) {
    return true
  }

  if (seriesKey === 'domain') {
    return record.savedInTabGroups.length > 0
  }

  if (seriesKey === 'custom') {
    return record.savedInProjects.length > 0
  }

  return true
}

const matchesDrilldownLabel = ({
  label,
  query,
  record,
  seriesKey,
  uncategorizedLabel,
  chartMessages,
}: {
  label: string
  query: AnalyticsQuery
  record: AiSavedUrlRecord
  seriesKey?: string
  uncategorizedLabel: string
  chartMessages: AnalyticsChartMessages
}): boolean => {
  const normalizedLabel = label.trim().toLowerCase()
  if (!normalizedLabel) {
    return false
  }

  if (!matchesDrilldownMode({ query, record, seriesKey })) {
    return false
  }

  return getDrilldownLabelsForRecord(
    record,
    query,
    uncategorizedLabel,
    chartMessages,
  ).some((value) => value.toLowerCase() === normalizedLabel)
}

const rebuildAnalyticsDrilldownSelection = ({
  chartMessages,
  currentSelection,
  nextRecords,
  query,
  uncategorizedLabel,
}: {
  chartMessages: AnalyticsChartMessages
  currentSelection: AnalyticsDrilldownSelection | null
  nextRecords: AiSavedUrlRecord[]
  query: AnalyticsQuery
  uncategorizedLabel: string
}): AnalyticsDrilldownSelection | null => {
  if (!currentSelection) {
    return null
  }

  return {
    ...currentSelection,
    matchingRecords: filterAnalyticsRecords(nextRecords, query, {
      messages: chartMessages,
    }).filter((record) =>
      matchesDrilldownLabel({
        chartMessages,
        label: currentSelection.label,
        query,
        record,
        seriesKey: currentSelection.seriesKey,
        uncategorizedLabel,
      }),
    ),
  }
}

const runConfirmedDelete = (
  deleteTarget: AiSavedUrlRecord | null,
  performDelete: (record: AiSavedUrlRecord) => Promise<void>,
): boolean => {
  if (!deleteTarget) {
    return false
  }

  void performDelete(deleteTarget)
  return true
}

const getViewNameValidationError = ({
  savedViews,
  viewName,
}: {
  savedViews: SavedAnalyticsView[]
  viewName: string
}): ViewNameValidationError | null => {
  const trimmedViewName = viewName.trim()

  if (!trimmedViewName) {
    return 'required'
  }

  return savedViews.some((view) => view.name.trim() === trimmedViewName)
    ? 'duplicate'
    : null
}

const useAnalyticsRouteView = () => {
  const { language, t } = useI18n()
  const [analyticsData, setAnalyticsData] = useState(() => ({
    records: awaitableEmptyRecords,
    savedViews: [] as SavedAnalyticsView[],
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

  const applyQuery = (nextQuery: AnalyticsQuery, nextViewName?: string) => {
    setIsUsingAiCharts(false)
    setAiChartSpecs([])
    setDrilldownSelection(null)
    setQuery(normalizeAnalyticsRouteQuery(nextQuery))
    if (nextViewName) {
      setViewName(nextViewName)
    }
  }

// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleSaveView = async () => {
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
  }

  const handleDeleteView = async (viewId: string) => {
    const nextViews = savedViews.filter((view) => view.id !== viewId)
    setSavedViews(nextViews)
    await deleteSavedAnalyticsView(viewId)
  }

// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleMessagesChange = (messages: AiChatConversationMessage[]) => {
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
  }

// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleChartPointClick = ({
    label,
    seriesKey,
    spec,
  }: AiChartPointSelection) => {
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
  }

  const refreshRecords = async () => {
    const nextRecords = await loadAnalyticsRecords()
    setRecords(nextRecords)
    return nextRecords
  }

  const rebuildDrilldownSelection = (nextRecords: AiSavedUrlRecord[]) => {
    setDrilldownSelection((currentSelection) =>
      rebuildAnalyticsDrilldownSelection({
        chartMessages,
        currentSelection,
        nextRecords,
        query,
        uncategorizedLabel: t('analytics.uncategorized'),
      }),
    )
  }

  const showDeleteUndoToast = ({
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
              await chrome.storage.local.set(
                createAnalyticsDeleteUndoPayload(snapshot),
              )
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
  }

  const performDelete = async (record: AiSavedUrlRecord) => {
    await runSingleDeleteWhenAllowed({
      deletingUrl,
      isBulkDeleting,
      onRun: async () => {
        try {
          setDeletingUrl(record.url)
          const undoSnapshot = await getAnalyticsDeleteUndoSnapshot()
          const nextRecords = await removeUrlFromStorage(record.url).then(() =>
            refreshRecords(),
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
  }

// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleDeleteClick = (record: AiSavedUrlRecord) => {
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
  }

  const handleOpenAllDrilldownRecords = () => {
    const matchingRecords = getDrilldownMatchingRecords(drilldownSelection)
    for (const record of matchingRecords) {
      window.open(record.url, '_blank', 'noopener,noreferrer')
    }
  }

// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleOpenAllClick = () => {
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
  }

  const performBulkDelete = async () => {
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
          ).then(() => refreshRecords())
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
  }

// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
  const handleDeleteAllClick = () => {
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
  }

  const isDeleteActionDisabled = deletingUrl !== null || isBulkDeleting

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
            <aside
              className='min-h-0 min-w-0'
              data-testid='analytics-sidebar-pane-container'
            >
              <ScrollArea
                className='h-full overflow-y-auto overscroll-contain'
                data-testid='analytics-sidebar-pane'
              >
                <div className='space-y-4 pr-3'>
                  <Card className='rounded-3xl border-border p-5 shadow-none'>
                    <CardHeader className='gap-1 p-0'>
                      <CardTitle className='text-lg'>
                        {t('analytics.conditionsTitle')}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className='mt-4 grid gap-3 p-0'>
                      <Field
                        className='gap-1.5'
                        data-invalid={viewNameError !== null}
                      >
                        <FieldLabel
                          className='text-sm'
                          htmlFor='analytics-view-name'
                        >
                          {t('analytics.viewName')}
                        </FieldLabel>
                        <Input
                          aria-label={t('analytics.viewName')}
                          aria-describedby={
                            viewNameError
                              ? 'analytics-view-name-error'
                              : undefined
                          }
                          aria-invalid={viewNameError !== null}
                          className='rounded-xl bg-background'
                          id='analytics-view-name'
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
                          onChange={(event) => {
                            const nextValue = event.target.value
                            setViewName(nextValue)
                            setViewNameError((currentError) =>
                              currentError
                                ? getViewNameValidationError({
                                    savedViews,
                                    viewName: nextValue,
                                  })
                                : currentError,
                            )
                          }}
                          value={viewName}
                        />
                        {viewNameError ? (
                          <FieldError id='analytics-view-name-error'>
                            {viewNameError === 'required'
                              ? t('analytics.viewNameRequired')
                              : t('analytics.viewNameDuplicate')}
                          </FieldError>
                        ) : null}
                      </Field>
                      <div className='grid gap-1.5'>
                        <Label className='text-sm' htmlFor='analytics-group-by'>
                          {t('analytics.groupByLabel')}
                        </Label>
                        <Select
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
                          onValueChange={(value) => {
                            applyQuery({
                              ...query,
// eslint-disable-next-line typescript/no-unsafe-type-assertion
                              groupBy: value as AnalyticsQuery['groupBy'],
                            })
                          }}
                          value={query.groupBy}
                        >
                          <SelectTrigger
                            aria-label={t('analytics.groupByLabel')}
                            className='rounded-xl bg-background'
                            id='analytics-group-by'
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {analyticsGroupByOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className='grid gap-1.5'>
                        <Label
                          className='text-sm'
                          htmlFor='analytics-chart-type'
                        >
                          {t('analytics.chartTypeLabel')}
                        </Label>
                        <Select
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
                          onValueChange={(value) => {
                            applyQuery({
                              ...query,
// eslint-disable-next-line typescript/no-unsafe-type-assertion
                              chartType: value as AnalyticsQuery['chartType'],
                            })
                          }}
                          value={query.chartType}
                        >
                          <SelectTrigger
                            aria-label={t('analytics.chartTypeLabel')}
                            className='rounded-xl bg-background'
                            id='analytics-chart-type'
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {analyticsChartTypeOptions.map((option) => (
                              <SelectItem
                                key={option.value}
                                value={option.value}
                              >
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className='grid gap-1.5'>
                        <Label className='text-sm' htmlFor='analytics-limit'>
                          {t('analytics.limitLabel')}
                        </Label>
                        <Input
                          aria-label={t('analytics.limitLabel')}
                          className='rounded-xl bg-background'
                          id='analytics-limit'
                          min={1}
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
                          onChange={(event) => {
                            applyQuery({
                              ...query,
                              limit: Math.max(
                                1,
                                Number(event.target.value) || 1,
                              ),
                            })
                          }}
                          type='number'
                          value={query.limit}
                        />
                      </div>
                    </CardContent>
                    <div className='mt-4 grid grid-cols-2 gap-2'>
                      <Button
                        className='w-full cursor-pointer rounded-xl'
// eslint-disable-next-line typescript/no-misused-promises
                        onClick={handleSaveView}
                        type='button'
                      >
                        {t('analytics.saveView')}
                      </Button>
                      <Button
                        className='w-full cursor-pointer rounded-xl'
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
                        onClick={() => {
                          applyQuery(defaultAnalyticsQuery)
                        }}
                        type='button'
                        variant='outline'
                      >
                        {t('common.reset')}
                      </Button>
                    </div>
                  </Card>

                  <Card className='rounded-3xl border-border p-5 shadow-none'>
                    <CardHeader className='gap-1 p-0'>
                      <CardTitle className='text-lg'>
                        {t('analytics.savedViewsTitle')}
                      </CardTitle>
                      <CardDescription>
                        {t('analytics.savedViewsDescription')}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className='mt-4 p-0'>
                      {savedViews.length === 0 ? (
                        <p className='text-sm text-muted-foreground'>
                          {t('analytics.savedViewsEmpty')}
                        </p>
                      ) : (
                        <div className='space-y-2'>
                          {savedViews.map((view) => (
                            <Card
                              className='rounded-2xl border-border p-3 shadow-none'
                              key={view.id}
                            >
                              <div className='flex items-center justify-between gap-2'>
                                <Button
                                  className='min-w-0 flex-1 justify-start px-0 text-left hover:bg-transparent'
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
                                  onClick={() => {
                                    applyQuery(view.query, view.name)
                                  }}
                                  type='button'
                                  variant='ghost'
                                >
                                  <span className='truncate text-sm font-medium'>
                                    {view.name}
                                  </span>
                                </Button>
                                <Button
                                  aria-label={t(
                                    'analytics.deleteViewAria',
                                    undefined,
                                    { name: view.name },
                                  )}
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
                                  onClick={() => void handleDeleteView(view.id)}
                                  size='sm'
                                  type='button'
                                  variant='outline'
                                  className='cursor-pointer rounded-lg'
                                >
                                  {t('common.delete')}
                                </Button>
                              </div>
                            </Card>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </ScrollArea>
            </aside>

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
                    <p className='mt-1 text-sm text-muted-foreground'>
                      {summary}
                    </p>
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
                          : generatedChartSpecs
                      }
                      onChartPointClick={handleChartPointClick}
                    />
                  </Card>
                </div>
                {drilldownSelection ? (
                  <Card className='mt-4 rounded-3xl bg-background p-4 shadow-none'>
                    <div className='flex flex-wrap items-start justify-between gap-3'>
                      <div>
                        <h3 className='text-base font-semibold'>
                          {t('analytics.drilldownTitle')}
                        </h3>
                        <p className='mt-1 text-sm text-muted-foreground'>
                          {drilldownSelection.specTitle} /{' '}
                          {drilldownSelection.label} /{' '}
                          {t('analytics.drilldownCount', undefined, {
                            count: String(
                              drilldownSelection.matchingRecords.length,
                            ),
                          })}
                        </p>
                      </div>
                      {drilldownSelection.matchingRecords.length > 0 ? (
                        <TooltipProvider delayDuration={0}>
                          <div className='flex shrink-0 items-center gap-1'>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  aria-label={t('analytics.openAllAria')}
                                  onClick={handleOpenAllClick}
                                  size='icon-sm'
                                  type='button'
                                  variant='ghost'
                                >
                                  <ExternalLink className='size-4' />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side='top'>
                                {t('savedTabs.openAll')}
                              </TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  aria-label={t('analytics.deleteAllAria')}
                                  disabled={isDeleteActionDisabled}
                                  onClick={handleDeleteAllClick}
                                  size='icon-sm'
                                  type='button'
                                  variant='ghost'
                                >
                                  <Trash2 className='size-4' />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent side='top'>
                                {t('savedTabs.deleteAll')}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                      ) : null}
                    </div>
                    <div className='mt-4 space-y-3'>
                      {drilldownSelection.matchingRecords.length === 0 ? (
                        <p className='text-sm text-muted-foreground'>
                          {t('analytics.drilldownEmpty')}
                        </p>
                      ) : (
                        drilldownSelection.matchingRecords.map((record) => (
                          <Card
                            className='rounded-2xl border-border bg-card p-3 shadow-none'
                            key={record.id}
                            style={deferredDrilldownCardStyle}
                          >
                            <div className='grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start'>
                              <div className='min-w-0 flex-1'>
                                <p className='truncate text-sm font-medium'>
                                  {record.title}
                                </p>
                                <div className='mt-2 flex flex-wrap gap-2 text-xs'>
                                  <Badge
                                    className='rounded-full'
                                    variant='secondary'
                                  >
                                    {record.domain}
                                  </Badge>
                                  {record.parentCategories.map((category) => (
                                    <Badge
                                      className='rounded-full'
                                      key={`${record.id}-${category}`}
                                      variant='secondary'
                                    >
                                      {category}
                                    </Badge>
                                  ))}
                                  {record.savedInProjects.map((project) => (
                                    <Badge
                                      className='rounded-full'
                                      key={`${record.id}-${project}`}
                                      variant='secondary'
                                    >
                                      {project}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                              <div className='flex shrink-0 flex-col gap-2 sm:items-end'>
                                <time className='text-xs text-muted-foreground'>
                                  {formatLocaleDateTime(
                                    record.savedAt,
                                    getAnalyticsDateLocale(language),
                                  )}
                                </time>
                                <AnalyticsRecordActionButtons
                                  deletingUrl={deletingUrl}
                                  handleDeleteClick={handleDeleteClick}
                                  isDeleteActionDisabled={
                                    isDeleteActionDisabled
                                  }
                                  record={record}
                                />
                              </div>
                            </div>
                          </Card>
                        ))
                      )}
                    </div>
                  </Card>
                ) : null}
              </div>
            </ScrollArea>
          </section>
        </div>
      </main>

      <LazySavedTabsChatWidget
        historyVariant='dropdown'
        onMessagesChange={handleMessagesChange}
      />

      <Toaster />

      <AlertDialog
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
        onOpenChange={(isOpen) => {
          setIsBulkDeleteConfirmOpen((currentOpen) =>
            getNextBulkDeleteDialogOpen({
              currentOpen,
              isBulkDeleting,
              isOpen,
            }),
          )
        }}
        open={isBulkDeleteConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('savedTabs.deleteAllConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('savedTabs.deleteAllDefaultWarning')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
              onClick={(event) => {
                event.preventDefault()
                void performBulkDelete()
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        onOpenChange={setIsOpenAllConfirmOpen}
        open={isOpenAllConfirmOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('savedTabs.openAllConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('savedTabs.openAllConfirmDescription', undefined, {
                count: '10',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
              onClick={() => {
                handleOpenAllDrilldownRecords()
              }}
            >
              {t('common.open')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
        onOpenChange={(isOpen) => {
          setDeleteTarget((currentTarget) =>
            getNextDeleteTargetAfterDialogOpenChange({
              currentTarget,
              deletingUrl,
              isOpen,
            }),
          )
        }}
        open={Boolean(deleteTarget)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('savedTabs.url.deleteConfirmTitle')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('savedTabs.url.deleteConfirmDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
// eslint-disable-next-line react-perf/jsx-no-new-function-as-prop
              onClick={(event) => {
                event.preventDefault()
                runConfirmedDelete(deleteTarget, performDelete)
              }}
            >
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

const AnalyticsRoute = () => useAnalyticsRouteView()

export {
  AnalyticsRoute,
  createAnalyticsDeleteUndoPayload,
  getAnalyticsChartDatumLabels,
  getDeleteAllAction,
  getDeleteClickAction,
  getDrilldownLabelsForRecord,
  getDrilldownMatchingRecords,
  getAnalyticsDateLocale,
  getLatestAnalyticsQuery,
  getLatestAssistantCharts,
  getNextBulkDeleteDialogOpen,
  getNextDeleteTargetAfterDialogOpenChange,
  getOpenAllAction,
  getViewNameValidationError,
  matchesDrilldownLabel,
  normalizeAnalyticsRouteQuery,
  noop,
  rebuildAnalyticsDrilldownSelection,
  removeUrlFromStorage,
  removeUrlRecordsFromStorage,
  runBulkDeleteWhenAllowed,
  runConfirmedDelete,
  runSingleDeleteWhenAllowed,
  shouldConfirmBulkOpen,
  shouldIgnoreBulkDeleteDialogClose,
  shouldIgnoreSingleDeleteDialogClose,
  shouldSkipBulkDelete,
  shouldSkipOpenAll,
  shouldSkipSingleDelete,
}
