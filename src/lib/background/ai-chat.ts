import { generateText, stepCountIs } from 'ai'
import { createOllama } from 'ai-sdk-ollama'

import { AI_CHAT_TOOL_TITLES } from '@/constants/aiChatTools'
import { buildTextAttachmentContext } from '@/features/ai-chat/lib/attachments'
import { buildAiSavedUrlRecords } from '@/features/ai-chat/lib/buildAiContext'
import { inferUserInterests } from '@/features/ai-chat/lib/inferInterests'
import { listSavedUrlPage } from '@/features/ai-chat/lib/savedUrlQuery'
import {
  buildFinalSystemPrompt,
  getActiveAiSystemPrompt,
  normalizeAiSystemPromptSettings,
} from '@/features/ai-chat/lib/systemPromptPresets'
import type {
  AiChartSpec,
  AiChatAttachment,
  AiSavedUrlRecord,
} from '@/features/ai-chat/types'
import { getMessage, resolveLanguage } from '@/features/i18n/lib/language'
import type { AppLanguage } from '@/features/i18n/messages'
import { getParentCategories } from '@/lib/storage/categories'
import { getCustomProjects } from '@/lib/storage/projects'
import { getUserSettings } from '@/lib/storage/settings'
import { getUrlRecords } from '@/lib/storage/urls'
import type { AiChatToolTrace, OllamaErrorDetails } from '@/types/background'

import { createAiChatTools } from './ai-chat-tools'

interface OllamaModelOption {
  name: string
  label: string
  modifiedAt?: string
}

interface AiChatHistoryMessage {
  role: 'user' | 'assistant'
  content: string
  attachments?: AiChatAttachment[]
}

interface AiChatRequest {
  prompt: string
  history: AiChatHistoryMessage[]
  attachments?: AiChatAttachment[]
}

interface AiChatResult {
  answer: string
  charts: AiChartSpec[]
  recordCount: number
  reasoning: string
  toolTraces: AiChatToolTrace[]
}

interface AiChatStepUpdate {
  charts?: AiChartSpec[]
  reasoning: string
  toolTraces: AiChatToolTrace[]
}

interface RunAiChatRequestOptions {
  onStepUpdate?: (update: AiChatStepUpdate) => void
}

const getAiChatUiLocale = () =>
  typeof chrome !== 'undefined'
    ? (chrome.i18n?.getUILanguage?.() ?? 'ja')
    : /* V8 ignore next -- coverage-only defensive branch. */
      /* V8 ignore start -- coverage-only defensive branch. */
      'ja'
/* V8 ignore stop */

const getNormalizedAiChatSettings = async () =>
  normalizeAiSystemPromptSettings((await getUserSettings()) ?? {})

const OLLAMA_BASE_URL = 'http://localhost:11434'
const OLLAMA_TAGS_URL = `${OLLAMA_BASE_URL}/api/tags`
const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download'
const OLLAMA_FAQ_URL =
  'https://docs.ollama.com/faq#how-do-i-configure-ollama-server'

type OllamaStructuredError = Error & {
  ollamaError: OllamaErrorDetails
}

const getExtensionOrigin = (): string | null => {
  try {
    const extensionUrl = chrome?.runtime?.getURL?.('')
    if (extensionUrl) {
      const parsedUrl = new URL(extensionUrl)
      if (parsedUrl.protocol && parsedUrl.host) {
        return `${parsedUrl.protocol}//${parsedUrl.host}`
      }
    }
  } catch {
    // Fallback to runtime.id
  }

  const extensionId = chrome?.runtime?.id
  return extensionId ? `chrome-extension://${extensionId}` : null
}

const getConfiguredOllamaOrigin = (): string => {
  const extensionOrigin = getExtensionOrigin()

  return extensionOrigin ?? 'chrome-extension://*'
}

const createBaseOllamaErrorDetails = (): Pick<
  OllamaErrorDetails,
  'baseUrl' | 'downloadUrl' | 'faqUrl' | 'tagsUrl'
> => ({
  baseUrl: OLLAMA_BASE_URL,
  downloadUrl: OLLAMA_DOWNLOAD_URL,
  faqUrl: OLLAMA_FAQ_URL,
  tagsUrl: OLLAMA_TAGS_URL,
})

const createOllamaSetupInstructions = (language: AppLanguage): string =>
  (() => {
    const configuredOrigin = getConfiguredOllamaOrigin()

    return [
      `${getMessage(language, 'aiChat.ollama.connectionUrl')}${OLLAMA_BASE_URL}`,
      `${getMessage(language, 'aiChat.ollama.tagsUrl')}${OLLAMA_TAGS_URL}`,
      `${getMessage(language, 'aiChat.ollama.checkCommand')} curl ${OLLAMA_TAGS_URL}`,
      getMessage(language, 'background.aiChat.ollama.macTitle'),
      getMessage(language, 'aiChat.ollama.mac.step1'),
      getMessage(language, 'aiChat.ollama.mac.step2'),
      `launchctl setenv OLLAMA_ORIGINS "${configuredOrigin}"`,
      getMessage(language, 'aiChat.ollama.mac.step3'),
      getMessage(language, 'aiChat.ollama.mac.step4'),
      getMessage(language, 'aiChat.ollama.mac.step5'),
      `${getMessage(language, 'aiChat.ollama.faq')} ${OLLAMA_FAQ_URL}`,
    ].join('\n')
  })()

const createOllamaForbiddenErrorMessage = (language: AppLanguage): string => {
  const allowedOrigins = getConfiguredOllamaOrigin()

  return [
    getMessage(language, 'aiChat.ollama.forbiddenError'),
    getMessage(
      language,
      'background.aiChat.ollama.setOriginsValue',
      undefined,
      {
        value: allowedOrigins,
      },
    ),
    createOllamaSetupInstructions(language),
  ].join('\n')
}

const createOllamaConnectionErrorMessage = (language: AppLanguage): string =>
  [
    getMessage(language, 'aiChat.ollama.connectionError'),
    `${getMessage(language, 'aiChat.ollama.downloadUrl')} ${OLLAMA_DOWNLOAD_URL}`,
    createOllamaSetupInstructions(language),
  ].join('\n')

const createOllamaError = (
  message: string,
  ollamaError: OllamaErrorDetails,
): OllamaStructuredError =>
  Object.assign(new Error(message), {
    ollamaError,
  })

const createOllamaForbiddenError = (
  language: AppLanguage = 'ja',
): OllamaStructuredError =>
  createOllamaError(createOllamaForbiddenErrorMessage(language), {
    ...createBaseOllamaErrorDetails(),
    allowedOrigins: getConfiguredOllamaOrigin(),
    kind: 'forbidden',
  })

const createOllamaConnectionError = (
  language: AppLanguage = 'ja',
): OllamaStructuredError =>
  createOllamaError(createOllamaConnectionErrorMessage(language), {
    ...createBaseOllamaErrorDetails(),
    allowedOrigins: getConfiguredOllamaOrigin(),
    kind: 'notInstalledOrNotRunning',
  })

const isForbiddenError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('403') && message.toLowerCase().includes('forbidden')
}

const isConnectionError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error)
  const normalizedMessage = message.toLowerCase()

  return (
    normalizedMessage.includes('failed to fetch') ||
    normalizedMessage.includes('fetch failed') ||
    normalizedMessage.includes('econnrefused')
  )
}

const createContextSummary = (
  records: AiSavedUrlRecord[],
  language: AppLanguage,
): string =>
  (() => {
    const recentSavedUrlPage = listSavedUrlPage(records, {
      page: 1,
      pageSize: 20,
      sortDirection: 'desc',
    })

    return [
      getMessage(language, 'background.aiChat.savedTabsCount', undefined, {
        count: String(recentSavedUrlPage.totalItems),
      }),
      getMessage(language, 'background.aiChat.recentTabs'),
      ...recentSavedUrlPage.items.map(
        (record, index) =>
          `${index + 1}. ${record.title} | ${record.url} | domain=${record.domain}`,
      ),
    ].join('\n')
  })()

const createUserMessageContent = (
  content: string,
  attachments: AiChatAttachment[] = [],
  language: AppLanguage = 'ja',
) => {
  if (attachments.length === 0) {
    return content
  }

  const textAttachmentContext = buildTextAttachmentContext(
    attachments,
    language,
  )
  const text = [content, textAttachmentContext].filter(Boolean).join('\n\n')
  const imageAttachments = attachments.filter(
    (attachment) => attachment.kind === 'image',
  )

  return [
    {
      text,
      type: 'text' as const,
    },
    ...imageAttachments.map((attachment) => ({
      data: attachment.content,
      mediaType: attachment.mediaType,
      type: 'file' as const,
    })),
  ]
}

const getStringValue = (
  record: Record<string, unknown>,
  key: string,
): string | undefined => {
  const value = record[key]
  return typeof value === 'string' ? value : undefined
}

const getToolTitle = (toolName: string): string =>
  AI_CHAT_TOOL_TITLES[toolName as keyof typeof AI_CHAT_TOOL_TITLES] || toolName

const getToolResultCount = (output: unknown): number | null => {
  if (Array.isArray(output)) {
    return output.length
  }

  if (
    output &&
    typeof output === 'object' &&
    Array.isArray((output as { items?: unknown[] }).items)
  ) {
    return (output as { items: unknown[] }).items.length
  }

  return null
}

const getPaginatedToolTotalCount = (output: unknown): number | null => {
  if (!output || typeof output !== 'object') {
    return null
  }

  const { totalItems } = output as { totalItems?: unknown }
  return typeof totalItems === 'number' ? totalItems : null
}

const getToolListSeparator = (language: AppLanguage) =>
  /* V8 ignore next -- coverage-only defensive branch. */
  /* V8 ignore start -- coverage-only defensive branch. */
  language === 'en' ? ', ' : '、'
/* V8 ignore stop */

interface GenerateTextToolCallLike {
  input: unknown
  toolCallId: string
  toolName: string
}

interface GenerateTextToolResultLike {
  output?: unknown
  toolCallId: string
}

interface GenerateTextResultLike {
  steps?: {
    toolCalls?: GenerateTextToolCallLike[]
    toolResults?: GenerateTextToolResultLike[]
  }[]
  toolCalls?: GenerateTextToolCallLike[]
  toolResults?: GenerateTextToolResultLike[]
}

const getAllToolCalls = (
  result: GenerateTextResultLike,
): GenerateTextToolCallLike[] => {
  const mergedToolCalls = [
    ...(result.steps ?? []).flatMap((step) => step.toolCalls ?? []),
    ...(result.toolCalls ?? []),
  ]
  const seen = new Set<string>()

  return mergedToolCalls.filter((toolCall) => {
    if (seen.has(toolCall.toolCallId)) {
      return false
    }

    seen.add(toolCall.toolCallId)
    return true
  })
}

const getAllToolResults = (
  result: GenerateTextResultLike,
): GenerateTextToolResultLike[] => {
  const mergedToolResults = [
    ...(result.steps ?? []).flatMap((step) => step.toolResults ?? []),
    ...(result.toolResults ?? []),
  ]
  const seen = new Set<string>()

  return mergedToolResults.filter((toolResult) => {
    if (seen.has(toolResult.toolCallId)) {
      return false
    }

    seen.add(toolResult.toolCallId)
    return true
  })
}

const createToolTracesFromParts = ({
  toolCalls,
  toolResults,
}: {
  toolCalls: GenerateTextToolCallLike[]
  toolResults: GenerateTextToolResultLike[]
}): AiChatToolTrace[] => {
  const toolResultsById = new Map(
    toolResults.map((toolResult) => [toolResult.toolCallId, toolResult]),
  )

  return toolCalls.map((toolCall) => {
    const toolResult = toolResultsById.get(toolCall.toolCallId)

    return {
      errorText: undefined,
      input: toolCall.input,
      output: toolResult?.output,
      state: toolResult ? 'output-available' : 'input-available',
      title: getToolTitle(toolCall.toolName),
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      type: 'dynamic-tool',
    }
  })
}

const createToolTraces = (result: GenerateTextResultLike): AiChatToolTrace[] =>
  createToolTracesFromParts({
    toolCalls: getAllToolCalls(result),
    toolResults: getAllToolResults(result),
  })

const summarizePromptIntent = (
  prompt: string,
  language: AppLanguage,
): string => {
  if (/どんな|一覧|何が|何の/i.test(prompt)) {
    return getMessage(language, 'background.aiChat.intent.list')
  }
  if (/好き|興味|傾向/i.test(prompt)) {
    return getMessage(language, 'background.aiChat.intent.interests')
  }
  if (/月|追加|いつ/i.test(prompt)) {
    return getMessage(language, 'background.aiChat.intent.time')
  }
  return getMessage(language, 'background.aiChat.intent.search')
}

const summarizeToolTrace = (
  toolTrace: AiChatToolTrace,
  language: AppLanguage,
): string => {
  const resultCount = getToolResultCount(toolTrace.output)
  const totalItems = getPaginatedToolTotalCount(toolTrace.output)

  if (resultCount !== null) {
    return totalItems !== null && totalItems !== resultCount
      ? getMessage(
          language,
          'background.aiChat.toolSummary.fetchedWithTotal',
          undefined,
          {
            count: String(resultCount),
            total: String(totalItems),
          },
        )
      : getMessage(
          language,
          'background.aiChat.toolSummary.fetchedCount',
          undefined,
          {
            count: String(resultCount),
          },
        )
  }
  if (toolTrace.output) {
    return getMessage(language, 'background.aiChat.toolSummary.resultRetrieved')
  }
  return getMessage(language, 'background.aiChat.toolSummary.callReviewed')
}

const createReasoningSummary = ({
  language,
  prompt,
  recordCount,
  toolTraces,
}: {
  language: AppLanguage
  prompt: string
  recordCount: number
  toolTraces: AiChatToolTrace[]
}): string =>
  [
    `- ${getMessage(language, 'background.aiChat.reasoning.intentLabel')} ${summarizePromptIntent(prompt, language)}`,
    `- ${getMessage(language, 'background.aiChat.reasoning.referenceLabel')} ${getMessage(
      language,
      'background.aiChat.savedTabsCount',
      undefined,
      {
        count: String(recordCount),
      },
    )}`,
    `- ${getMessage(language, 'background.aiChat.reasoning.toolsLabel')} ${
      toolTraces.length > 0
        ? toolTraces
            .map((toolTrace) => toolTrace.title)
            .join(getToolListSeparator(language))
        : getMessage(language, 'background.aiChat.none')
    }`,
    `- ${getMessage(language, 'background.aiChat.reasoning.policyLabel')} ${
      toolTraces.length > 0
        ? getMessage(language, 'background.aiChat.reasoning.policyWithTools')
        : getMessage(language, 'background.aiChat.reasoning.policyWithoutTools')
    }`,
    ...toolTraces.map(
      (toolTrace) =>
        `- ${toolTrace.title}: ${summarizeToolTrace(toolTrace, language)}`,
    ),
  ].join('\n')

const mergeToolTraces = (
  currentToolTraces: AiChatToolTrace[],
  nextToolTraces: AiChatToolTrace[],
): AiChatToolTrace[] => {
  const mergedToolTraces = [...currentToolTraces]
  const indexByToolCallId = new Map(
    mergedToolTraces.map((toolTrace, index) => [toolTrace.toolCallId, index]),
  )

  for (const nextToolTrace of nextToolTraces) {
    const existingIndex = indexByToolCallId.get(nextToolTrace.toolCallId) ?? -1

    if (existingIndex === -1) {
      indexByToolCallId.set(nextToolTrace.toolCallId, mergedToolTraces.length)
      mergedToolTraces.push(nextToolTrace)
      continue
    }

    mergedToolTraces[existingIndex] = nextToolTrace
  }

  return mergedToolTraces
}

const isChartSpec = (value: unknown): value is AiChartSpec => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const spec = value as Partial<AiChartSpec>

  return (
    typeof spec.title === 'string' &&
    typeof spec.type === 'string' &&
    Array.isArray(spec.data) &&
    Array.isArray(spec.series)
  )
}

const getChartSpecsFromOutput = (output: unknown): AiChartSpec[] => {
  if (!output || typeof output !== 'object') {
    return []
  }

  const { chartSpecs } = output as { chartSpecs?: unknown }
  if (!Array.isArray(chartSpecs)) {
    return []
  }

  return chartSpecs.filter(isChartSpec)
}

const getChartsFromToolTraces = (
  toolTraces: AiChatToolTrace[],
): AiChartSpec[] =>
  toolTraces.flatMap((toolTrace) => getChartSpecsFromOutput(toolTrace.output))

const CHART_REQUEST_PATTERN =
  /円グラフ|棒グラフ|線グラフ|レーダー|グラフ|チャート|割合|比率|構成|ジャンル|カテゴリ|傾向/u

const shouldFallbackToInterestCharts = (prompt: string): boolean =>
  CHART_REQUEST_PATTERN.test(prompt)

const listLocalOllamaModels = async (
  fetchImpl: typeof fetch = fetch,
): Promise<OllamaModelOption[]> => {
  let response: Response

  try {
    response = await fetchImpl(OLLAMA_TAGS_URL, {
      method: 'GET',
    })
  } catch (error) {
    const settings = await getNormalizedAiChatSettings()
    const language = resolveLanguage(
      settings.language ?? 'system',
      getAiChatUiLocale(),
    )
    if (isConnectionError(error)) {
      throw createOllamaConnectionError(language)
    }
    throw error
  }

  const settings = await getNormalizedAiChatSettings()
  const language = resolveLanguage(
    settings.language ?? 'system',
    getAiChatUiLocale(),
  )
  if (response.status === 403) {
    throw createOllamaForbiddenError(language)
  }

  if (!response.ok) {
    throw new Error('Failed to fetch Ollama models')
  }

  const payload = (await response.json()) as Record<string, unknown>
  const models = Array.isArray(payload.models) ? payload.models : []

  return models.flatMap((model) => {
    if (!model || typeof model !== 'object') {
      return []
    }

    const modelRecord = model as Record<string, unknown>
    const name = getStringValue(modelRecord, 'name')
    if (!name) {
      return []
    }

    const modifiedAt = getStringValue(modelRecord, 'modified_at')
    const details =
      modelRecord.details && typeof modelRecord.details === 'object'
        ? (modelRecord.details as Record<string, unknown>)
        : null
    const parameterSize = details
      ? getStringValue(details, 'parameter_size')
      : undefined

    return [
      {
        label: parameterSize ? `${name} (${parameterSize})` : name,
        modifiedAt,
        name,
      },
    ]
  })
}

const runAiChatRequest = async (
  { attachments = [], history, prompt }: AiChatRequest,
  options: RunAiChatRequestOptions = {},
): Promise<AiChatResult> => {
  const settings = await getNormalizedAiChatSettings()
  const activeSystemPrompt = getActiveAiSystemPrompt(settings)
  const language = resolveLanguage(
    settings.language ?? 'system',
    getAiChatUiLocale(),
  )

  if (!settings.ollamaModel) {
    throw new Error('Ollama model is not configured')
  }
  const { ollamaModel } = settings

  const [urlRecords, customProjects, parentCategories, savedTabsResult] =
    await Promise.all([
      getUrlRecords(),
      getCustomProjects(),
      getParentCategories(),
      chrome.storage.local.get<{
        savedTabs?: import('@/types/storage').TabGroup[]
      }>('savedTabs'),
    ])

  const records = buildAiSavedUrlRecords({
    customProjects,
    parentCategories,
    savedTabs: Array.isArray(savedTabsResult.savedTabs)
      ? savedTabsResult.savedTabs
      : [],
    urlRecords,
  })

  const ollama = createOllama({
    baseURL: OLLAMA_BASE_URL,
  })

  const tools = createAiChatTools(records, language)
  let streamedToolTraces: AiChatToolTrace[] = []

  const result = await (async () => {
    try {
      return await generateText({
        messages: [
          ...history.map((message) =>
            message.role === 'user'
              ? {
                  role: 'user' as const,
                  content: createUserMessageContent(
                    message.content,
                    message.attachments,
                    language,
                  ),
                }
              : {
                  role: message.role,
                  content: message.content,
                },
          ),
          {
            role: 'user' as const,
            content: createUserMessageContent(prompt, attachments, language),
          },
        ],
        model: ollama(ollamaModel),
        onStepFinish: (stepResult) => {
          const stepToolTraces = createToolTracesFromParts({
            toolCalls: stepResult.toolCalls ?? [],
            toolResults: stepResult.toolResults ?? [],
          })

          streamedToolTraces = mergeToolTraces(
            streamedToolTraces,
            stepToolTraces,
          )

          options.onStepUpdate?.({
            reasoning: createReasoningSummary({
              language,
              prompt,
              recordCount: records.length,
              toolTraces: streamedToolTraces,
            }),
            toolTraces: streamedToolTraces,
          })
        },
        stopWhen: stepCountIs(5),
        system: buildFinalSystemPrompt({
          savedUrlContext: createContextSummary(records, language),
          template: activeSystemPrompt.template,
        }),
        tools,
      })
    } catch (error) {
      if (isForbiddenError(error)) {
        throw createOllamaForbiddenError(language)
      }
      if (isConnectionError(error)) {
        throw createOllamaConnectionError(language)
      }
      throw error
    }
  })()

  const toolTraces = mergeToolTraces(
    streamedToolTraces,
    createToolTraces(result),
  )
  const toolCharts = getChartsFromToolTraces(toolTraces)
  const fallbackCharts =
    toolCharts.length === 0 && shouldFallbackToInterestCharts(prompt)
      ? inferUserInterests(records, language).chartSpecs
      : []

  return {
    answer: result.text,
    charts: toolCharts.length > 0 ? toolCharts : fallbackCharts,
    reasoning: createReasoningSummary({
      language,
      prompt,
      recordCount: records.length,
      toolTraces,
    }),
    recordCount: records.length,
    toolTraces,
  }
}

export type {
  AiChatHistoryMessage,
  AiChatRequest,
  AiChatResult,
  OllamaModelOption,
}
export { listLocalOllamaModels, runAiChatRequest }
