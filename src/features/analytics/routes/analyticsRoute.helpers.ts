import { getBackgroundSavedTabsDataPlane } from '@/app/composition/backgroundSavedTabsDataPlane'
import type { PersistenceVersionedSavedTabsSnapshot } from '@/contexts/saved-tabs/public-api'
import type {
  AiChartSpec,
  AiChatConversationMessage,
  AiSavedUrlRecord,
} from '@/features/ai-chat/types'
import {
  filterAnalyticsRecords,
  generateAnalyticsResult,
  getLabelsForGroup,
  normalizeAnalyticsQuery,
  parseAnalyticsQuery,
} from '@/features/analytics/lib/analytics'
import type { AnalyticsQuery } from '@/features/analytics/lib/analytics'
import type { loadAnalyticsRecords } from '@/features/analytics/lib/loadAnalyticsRecords'
import { isObjectLike } from '@/lib/browser/chrome-global'
import { sendRuntimeMessage } from '@/lib/browser/runtime'
import type { SavedAnalyticsView } from '@/lib/storage/analytics'
import type { AiChatToolTrace } from '@/types/background'

const parseGroupBy = (value: string): AnalyticsQuery['groupBy'] => {
  switch (value) {
    case 'collection':
    case 'collectionCategory':
    case 'collectionGroup':
    case 'domain':
    case 'parentCategory':
    case 'project':
    case 'projectCategory':
    case 'subCategory':
    case 'timeRecent':
    case 'timeTop': {
      return value
    }
    default: {
      return 'domain'
    }
  }
}

const parseChartType = (value: string): AnalyticsQuery['chartType'] => {
  switch (value) {
    case 'area':
    case 'bar':
    case 'line':
    case 'pie':
    case 'radar': {
      return value
    }
    default: {
      return 'bar'
    }
  }
}

const parseMetric = (value: string): NonNullable<AnalyticsQuery['metric']> => {
  switch (value) {
    case 'first-saved':
    case 'last-saved':
    case 'membership-added': {
      return value
    }
    default: {
      return 'first-saved'
    }
  }
}

const parseCollectionType = (
  value: string,
): NonNullable<AnalyticsQuery['collectionType']> => {
  switch (value) {
    case 'all':
    case 'custom':
    case 'domain': {
      return value
    }
    default: {
      return 'all'
    }
  }
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

    const query: unknown =
      toolTrace.output && typeof toolTrace.output === 'object'
        ? Reflect.get(toolTrace.output, 'query')
        : undefined
    const parsedQuery = parseAnalyticsQuery(query)
    if (parsedQuery) {
      return parsedQuery
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

const BULK_OPEN_THRESHOLD = 10

const shouldConfirmBulkOpen = (recordCount: number): boolean =>
  recordCount >= BULK_OPEN_THRESHOLD
const noop = (): void => {}

const shouldSkipSingleDelete = ({
  deletingUrl,
  isBulkDeleting,
}: {
  deletingUrl: string | null
  isBulkDeleting: boolean
}): boolean => Boolean(deletingUrl || isBulkDeleting) // eslint-disable-line typescript/prefer-nullish-coalescing -- `||` needed: empty string URL should fall through

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
  matchingRecordCount === 0 || Boolean(deletingUrl || isBulkDeleting) // eslint-disable-line typescript/prefer-nullish-coalescing -- `||` needed: empty string URL should fall through

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

type RemoveResponse = { error?: string; status?: string }

const isRemoveResponse = (value: unknown): value is RemoveResponse =>
  isObjectLike(value) &&
  (typeof Reflect.get(value, 'status') === 'string' ||
    typeof Reflect.get(value, 'error') === 'string')

const removeUrlFromStorage = async (url: string): Promise<void> => {
  const response = await sendRuntimeMessage({
    action: 'removeUrlFromStorage',
    url,
  })
  const typedResponse = isRemoveResponse(response) ? response : undefined
  if (typedResponse?.status !== 'removed') {
    throw new Error(typedResponse?.error || 'removeUrlFromStorage failed') // eslint-disable-line typescript/prefer-nullish-coalescing -- `||` needed: empty error string should show default message
  }
}

const getAnalyticsDateLocale = (language: string): 'en-US' | 'ja-JP' =>
  language === 'ja' ? 'ja-JP' : 'en-US'

const removeUrlRecordsFromStorage = async (urlIds: string[]): Promise<void> => {
  const response = await sendRuntimeMessage({
    action: 'removeUrlRecordsFromStorage',
    urlIds,
  })
  const typedResponse = isRemoveResponse(response) ? response : undefined
  if (typedResponse?.status !== 'removed') {
    // eslint-disable-next-line typescript/prefer-nullish-coalescing -- `||` needed: empty error string should show default message
    const errMsg = typedResponse?.error || 'removeUrlRecordsFromStorage failed'
    throw new Error(errMsg)
  }
}

type AnalyticsDeleteUndoSnapshot = PersistenceVersionedSavedTabsSnapshot

type AnalyticsDeleteUndoPayload = PersistenceVersionedSavedTabsSnapshot

const getAnalyticsDeleteUndoSnapshot =
  async (): Promise<AnalyticsDeleteUndoSnapshot> =>
    getBackgroundSavedTabsDataPlane().readUndoSnapshot()

const createAnalyticsDeleteUndoPayload = (
  snapshot: AnalyticsDeleteUndoSnapshot,
): AnalyticsDeleteUndoPayload => snapshot

const normalizeAnalyticsRouteQuery = (
  analyticsQuery: AnalyticsQuery,
): AnalyticsQuery => ({
  ...normalizeAnalyticsQuery(analyticsQuery),
  mode: 'both',
})

type AnalyticsDrilldownSelection = {
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
    // eslint-disable-next-line typescript/no-base-to-string
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
  if (query.groupBy === 'timeRecent' || query.groupBy === 'timeTop') {
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
  return getLabelsForGroup(
    record,
    query.groupBy,
    uncategorizedLabel,
    query.collectionType,
  )
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

export type {
  AnalyticsChartMessages,
  AnalyticsDeleteUndoPayload,
  AnalyticsDeleteUndoSnapshot,
  AnalyticsDrilldownSelection,
  DeleteAllAction,
  DeleteClickAction,
  OpenAllAction,
  ViewNameValidationError,
}
export {
  awaitableEmptyRecords,
  createAnalyticsDeleteUndoPayload,
  getAnalyticsChartDatumLabels,
  getAnalyticsDateLocale,
  getAnalyticsDeleteUndoSnapshot,
  getDeleteAllAction,
  getDeleteClickAction,
  getDrilldownLabelsForRecord,
  getDrilldownMatchingRecords,
  getLatestAnalyticsQuery,
  getLatestAssistantCharts,
  getNextBulkDeleteDialogOpen,
  getNextDeleteTargetAfterDialogOpenChange,
  getOpenAllAction,
  getViewNameValidationError,
  matchesDrilldownLabel,
  noop,
  normalizeAnalyticsRouteQuery,
  parseChartType,
  parseCollectionType,
  parseGroupBy,
  parseMetric,
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
