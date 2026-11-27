import type { AiChatToolTrace } from '@/types/background'

type TranslateFn = (
  key: string,
  fallback?: string,
  values?: Record<string, string>,
) => string

const RUNNING_TOOL_STATES: ReadonlySet<AiChatToolTrace['state']> = new Set([
  'input-available',
  'input-streaming',
])

const FAILED_TOOL_STATES: ReadonlySet<AiChatToolTrace['state']> = new Set([
  'output-denied',
  'output-error',
])

const isToolTraceRunning = (toolTrace: AiChatToolTrace): boolean =>
  RUNNING_TOOL_STATES.has(toolTrace.state)

const isToolTraceFailed = (toolTrace: AiChatToolTrace): boolean =>
  FAILED_TOOL_STATES.has(toolTrace.state) ||
  (toolTrace.errorText !== undefined && toolTrace.errorText.length > 0)

/**
 * ツールトレースの人間向け要約文。
 * 実行中は進捗が分かる文言にし、それ以外は既存のツールタイトルを使う。
 * 未知のツールでも title（background 側で toolName にフォールバック済み）で
 * 汎用表示になる。
 */
const getToolTraceSummary = (
  toolTrace: AiChatToolTrace,
  t: TranslateFn,
): string =>
  isToolTraceRunning(toolTrace)
    ? t('aiChat.toolTrace.running', undefined, { title: toolTrace.title })
    : toolTrace.title

/**
 * 回答生成中に「いま何を実行しているか」を示す進捗文。
 * 実行中のツールがなければ undefined（汎用の生成中表示に任せる）。
 */
const getCurrentToolProgress = (
  toolTraces: readonly AiChatToolTrace[],
  t: TranslateFn,
): string | undefined => {
  const runningTrace = toolTraces
    .toReversed()
    .find((toolTrace) => isToolTraceRunning(toolTrace))

  return runningTrace ? getToolTraceSummary(runningTrace, t) : undefined
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Ollama 形式などのツール呼び出し JSON かどうか。
 * 小型モデルはツール呼び出しを通常の JSON テキストとして出力することがあり、
 * その形を Reasoning 表示から取り除くために判定する。
 */
const isToolCallJson = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false
  }

  const functionValue: unknown = Reflect.get(value, 'function')
  if (isRecord(functionValue) && typeof functionValue.name === 'string') {
    return true
  }

  if (value.type === 'function') {
    return true
  }

  return (
    typeof value.name === 'string' &&
    (isRecord(Reflect.get(value, 'parameters')) ||
      isRecord(Reflect.get(value, 'arguments')))
  )
}

const tryParseJson = (text: string): unknown => {
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed
  } catch {
    return undefined
  }
}

/** startIndex の `{` から対応する `}` までの範囲を返す（文字列内は考慮する）。 */
const findBalancedJsonEnd = (text: string, startIndex: number): number => {
  let depth = 0
  let inString = false
  let isEscaped = false

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text.charAt(index)

    if (inString) {
      if (isEscaped) {
        isEscaped = false
      } else if (char === '\\') {
        isEscaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
    } else if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return index
      }
    }
  }

  return -1
}

type SanitizedReasoning = {
  hiddenToolCallCount: number
  text: string
}

const FENCED_CODE_BLOCK_PATTERN = /```[^\n`]*\n?([\s\S]*?)```/g

/**
 * Reasoning テキストからツール呼び出しの生 JSON を取り除き、
 * replacement の要約文に置き換える。生 JSON 以外の文章はそのまま保持する
 * （大型モデル利用時の既存表示を損なわないため）。
 */
const sanitizeReasoningForDisplay = (
  reasoning: string,
  replacement: string,
): SanitizedReasoning => {
  let hiddenToolCallCount = 0

  const withoutFencedToolCalls = reasoning.replace(
    FENCED_CODE_BLOCK_PATTERN,
    (block, inner: string) =>
      isToolCallJson(tryParseJson(inner.trim()))
        ? ((hiddenToolCallCount += 1), replacement)
        : block,
  )

  let text = ''
  let cursor = 0

  while (cursor < withoutFencedToolCalls.length) {
    const start = withoutFencedToolCalls.indexOf('{', cursor)
    if (start === -1) {
      text += withoutFencedToolCalls.slice(cursor)
      break
    }

    const end = findBalancedJsonEnd(withoutFencedToolCalls, start)
    if (end === -1) {
      text += withoutFencedToolCalls.slice(cursor)
      break
    }

    const candidate = withoutFencedToolCalls.slice(start, end + 1)
    if (isToolCallJson(tryParseJson(candidate))) {
      text += withoutFencedToolCalls.slice(cursor, start)
      if (!text.trimEnd().endsWith(replacement)) {
        text += replacement
      }
      hiddenToolCallCount += 1
      cursor = end + 1
      continue
    }

    text += withoutFencedToolCalls.slice(cursor, start + 1)
    cursor = start + 1
  }

  return { hiddenToolCallCount, text }
}

export {
  getCurrentToolProgress,
  getToolTraceSummary,
  isToolTraceFailed,
  isToolTraceRunning,
  sanitizeReasoningForDisplay,
}
export type { SanitizedReasoning }
