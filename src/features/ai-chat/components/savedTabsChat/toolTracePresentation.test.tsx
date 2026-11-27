import { describe, expect, it } from 'vitest'

import type { AiChatToolTrace } from '@/types/background'

import type { TranslateFn } from './messages'
import {
  getCurrentToolProgress,
  getToolTraceSummary,
  isToolTraceFailed,
  isToolTraceRunning,
  sanitizeReasoningForDisplay,
} from './toolTracePresentation'

const t: TranslateFn = (key, fallback, values) => {
  const templates: Record<string, string> = {
    'aiChat.toolTrace.running': 'Running {{title}}…',
  }
  const template = templates[key] ?? fallback ?? key
  return template.replaceAll(
    /\{\{(\w+)\}\}/g,
    (_, token: string) => values?.[token] ?? '',
  )
}

const createTrace = (
  overrides: Partial<AiChatToolTrace> = {},
): AiChatToolTrace => ({
  input: {},
  state: 'output-available',
  title: 'Search tabs by month',
  toolCallId: 'call-1',
  toolName: 'findUrlsByMonth',
  type: 'dynamic-tool',
  ...overrides,
})

const REPLACEMENT = 'Tool call data is hidden here.'

describe('isToolTraceRunning / isToolTraceFailed', () => {
  it('treats input states as running', () => {
    expect(isToolTraceRunning(createTrace({ state: 'input-streaming' }))).toBe(
      true,
    )
    expect(isToolTraceRunning(createTrace({ state: 'input-available' }))).toBe(
      true,
    )
    expect(isToolTraceRunning(createTrace({ state: 'output-available' }))).toBe(
      false,
    )
  })

  it('treats error states and errorText as failed', () => {
    expect(isToolTraceFailed(createTrace({ state: 'output-error' }))).toBe(true)
    expect(isToolTraceFailed(createTrace({ state: 'output-denied' }))).toBe(
      true,
    )
    expect(
      isToolTraceFailed(createTrace({ errorText: 'Invalid arguments' })),
    ).toBe(true)
    expect(isToolTraceFailed(createTrace())).toBe(false)
  })
})

describe('getToolTraceSummary / getCurrentToolProgress', () => {
  it('summarizes a running trace with progress wording', () => {
    expect(
      getToolTraceSummary(createTrace({ state: 'input-available' }), t),
    ).toBe('Running Search tabs by month…')
  })

  it('keeps the existing title for a completed trace', () => {
    expect(getToolTraceSummary(createTrace(), t)).toBe('Search tabs by month')
  })

  it('falls back to the raw tool title for unknown tools', () => {
    expect(
      getToolTraceSummary(
        createTrace({ title: 'someUnknownTool', toolName: 'someUnknownTool' }),
        t,
      ),
    ).toBe('someUnknownTool')
  })

  it('reports the most recent running trace as progress', () => {
    const traces = [
      createTrace({ toolCallId: 'call-1' }),
      createTrace({
        state: 'input-available',
        title: 'List saved tabs',
        toolCallId: 'call-2',
        toolName: 'listSavedUrls',
      }),
    ]

    expect(getCurrentToolProgress(traces, t)).toBe('Running List saved tabs…')
    expect(getCurrentToolProgress([createTrace()], t)).toBeUndefined()
    expect(getCurrentToolProgress([], t)).toBeUndefined()
  })
})

describe('sanitizeReasoningForDisplay', () => {
  it('hides a bare Ollama-style tool call JSON (audit fixture)', () => {
    const reasoning =
      'Default What tabs do I have saved? Please list them. Reasoning {"type":"function","function":{"name": "listSavedUrls","parameters": {"page": "1", "pageSize": "50", "sortDirection": "asc", "sort": "time", "limit": "20", "year": "2023", "month": "1"}}}'

    const result = sanitizeReasoningForDisplay(reasoning, REPLACEMENT)

    expect(result.hiddenToolCallCount).toBe(1)
    expect(result.text).not.toContain('"year"')
    expect(result.text).not.toContain('listSavedUrls')
    expect(result.text).toContain(REPLACEMENT)
    expect(result.text).toContain('What tabs do I have saved?')
  })

  it('hides a fenced tool call JSON block', () => {
    const reasoning =
      'Checking.\n```json\n{"name": "searchSavedUrls", "parameters": {"keyword": "react"}}\n```\nDone.'

    const result = sanitizeReasoningForDisplay(reasoning, REPLACEMENT)

    expect(result.hiddenToolCallCount).toBe(1)
    expect(result.text).not.toContain('searchSavedUrls')
    expect(result.text).toContain('Checking.')
    expect(result.text).toContain('Done.')
  })

  it('keeps ordinary reasoning text unchanged (large-model regression)', () => {
    const reasoning =
      '- Intent: list saved tabs\n- Tools: List saved tabs\n- Result: {"count": 3} items were found in the saved data.'

    const result = sanitizeReasoningForDisplay(reasoning, REPLACEMENT)

    expect(result.hiddenToolCallCount).toBe(0)
    expect(result.text).toBe(reasoning)
  })

  it('keeps non-tool-call JSON objects unchanged', () => {
    const reasoning = 'Config was {"theme": "dark", "nested": {"level": 2}}.'

    const result = sanitizeReasoningForDisplay(reasoning, REPLACEMENT)

    expect(result.hiddenToolCallCount).toBe(0)
    expect(result.text).toBe(reasoning)
  })

  it('keeps a description-only function JSON unchanged', () => {
    const reasoning =
      'The value is {"type":"function","description":"A callable value"}.'

    const result = sanitizeReasoningForDisplay(reasoning, REPLACEMENT)

    expect(result.hiddenToolCallCount).toBe(0)
    expect(result.hiddenToolCalls).toEqual([])
    expect(result.text).toBe(reasoning)
  })

  it('replaces an incomplete tool call JSON while streaming', () => {
    const reasoning =
      'Checking {"type":"function","function":{"name":"listSavedUrls","parameters":'

    const result = sanitizeReasoningForDisplay(reasoning, REPLACEMENT)

    expect(result.hiddenToolCallCount).toBe(1)
    expect(result.text).toBe(`Checking ${REPLACEMENT}`)
    expect(result.text).not.toContain('listSavedUrls')
    expect(result.hiddenToolCalls).toHaveLength(1)
  })

  it('keeps an incomplete non-tool JSON unchanged', () => {
    const reasoning = 'Consider {a, b} and {c'

    const result = sanitizeReasoningForDisplay(reasoning, REPLACEMENT)

    expect(result.hiddenToolCallCount).toBe(0)
    expect(result.text).toBe(reasoning)
  })

  it('returns the hidden raw JSON for the details view', () => {
    const reasoning =
      'Checking.\n```json\n{"name": "searchSavedUrls", "parameters": {"keyword": "react"}}\n```\nDone.'

    const result = sanitizeReasoningForDisplay(reasoning, REPLACEMENT)

    expect(result.hiddenToolCalls).toEqual([
      '{"name": "searchSavedUrls", "parameters": {"keyword": "react"}}',
    ])
  })

  it('collapses consecutive tool call JSON into one replacement', () => {
    const reasoning =
      '{"type":"function","function":{"name":"listSavedUrls","parameters":{}}} {"type":"function","function":{"name":"listSavedUrls","parameters":{}}}'

    const result = sanitizeReasoningForDisplay(reasoning, REPLACEMENT)

    expect(result.hiddenToolCallCount).toBe(2)
    expect(result.text.trim()).toBe(REPLACEMENT)
  })
})
