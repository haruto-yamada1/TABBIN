// Issue #799 Step 4 — Waza session/transcript → EvalTrace adapter.
//
// Waza の real-model eval (Layer 3) は session log (NDJSON) と per-task transcript
// (JSON) を出力する。本 adapter はそれらを読み込み、waza-trace-evaluator が消費する
// EvalTrace へ変換する。
//
// 設計方針:
//   - unknown / malformed event を黙って無視しない (fail-closed)
//   - parse 不能時は infrastructure/config failure として例外を投げる
//   - tool name / args / result を正規化する
//   - shell 系 tool の `command` field 差異を吸収する
//   - outbound payload と filesystem diff を可能な範囲で復元する
//   - mock executor (transcript: null) は final_output のみ抽出する

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import path from 'node:path'

import type {
  EvalTrace,
  RequestIntent,
  ToolInvocation,
  OutboundPayload,
  FilesystemDiff,
} from './waza-trace-evaluator'

// ── Waza artifact schema types (v0.38.3) ──────────────────────────

type WazaResultRun = {
  readonly status?: string
  readonly output?: string
  readonly final_output?: string
  readonly transcript?: unknown
}

type WazaResultTask = {
  readonly test_id?: string
  readonly display_name?: string
  readonly status?: string
  readonly runs?: readonly WazaResultRun[]
}

type WazaResults = {
  readonly schemaVersion?: string
  readonly skill?: string
  readonly tasks?: readonly WazaResultTask[]
}

type TranscriptFile = {
  readonly task_id?: string
  readonly task_name?: string
  readonly status?: string
  readonly prompt?: string
  readonly final_output?: string
  readonly transcript?: unknown
  readonly session?: {
    readonly tool_call_count?: number
    readonly tools_used?: readonly string[]
    readonly errors?: readonly string[]
  }
}

// ── conversation turn types (real-mode transcript) ────────────────

type ToolCall = {
  readonly name?: string
  readonly arguments?: unknown
  readonly id?: string
}

type ConversationTurn = {
  readonly role?: string
  readonly content?: unknown
  readonly tool_calls?: readonly ToolCall[]
  readonly name?: string
  readonly tool_call_id?: string
  readonly outbound?: { readonly kind?: unknown; readonly content?: unknown }
  readonly filesystem_diffs?: unknown
}

// ── helpers ──────────────────────────────────────────────────────

const isString = (v: unknown): v is string => typeof v === 'string'
const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isArray = (v: unknown): v is readonly unknown[] => Array.isArray(v)

const stringifyUnknown = (v: unknown): string => {
  if (isString(v)) {
    return v
  }
  try {
    const result: unknown = JSON.stringify(v)
    return typeof result === 'string' ? result : ''
  } catch {
    return ''
  }
}

const normalizeToolArgs = (args: unknown): Record<string, unknown> => {
  if (isRecord(args)) {
    return args
  }
  if (typeof args === 'string') {
    try {
      const parsed: unknown = JSON.parse(args)
      return isRecord(parsed) ? parsed : { command: args }
    } catch {
      return { command: args }
    }
  }
  return {}
}

const normalizeFilesystemStatus = (
  status: string,
): FilesystemDiff['status'] => {
  if (status === 'deleted') {
    return 'deleted'
  }
  if (status === 'added') {
    return 'added'
  }
  return 'modified'
}

const isOutboundKind = (v: string): v is OutboundPayload['kind'] =>
  v === 'pr_body' ||
  v === 'issue_body' ||
  v === 'comment' ||
  v === 'commit_message' ||
  v === 'review_reply'

const normalizeOutboundKind = (kind: string): OutboundPayload['kind'] =>
  isOutboundKind(kind) ? kind : 'comment'

// ── extraction functions ─────────────────────────────────────────

const processToolCalls = (
  toolCalls: readonly unknown[],
  invocations: ToolInvocation[],
  callIdToName: Map<string, string>,
): void => {
  for (const rawCall of toolCalls) {
    if (!isRecord(rawCall)) {
      throw new Error('trace-adapter: tool_call entry is not an object')
    }
    const call: ToolCall = rawCall
    const name = isString(call.name) ? call.name : 'unknown_tool'
    const args = normalizeToolArgs(call.arguments)
    if (isString(call.id)) {
      callIdToName.set(call.id, name)
    }
    invocations.push({ name, args })
  }
}

const extractToolInvocationsFromTurns = (
  turns: readonly ConversationTurn[],
): ToolInvocation[] => {
  const invocations: ToolInvocation[] = []
  const callIdToName = new Map<string, string>()

  for (const turn of turns) {
    const role = turn.role ?? ''

    if (role === 'assistant' && isArray(turn.tool_calls)) {
      processToolCalls(turn.tool_calls, invocations, callIdToName)
    }

    if (role === 'tool') {
      const toolName = isString(turn.name)
        ? turn.name
        : (callIdToName.get(turn.tool_call_id ?? '') ?? 'unknown_tool')
      const result = stringifyUnknown(turn.content)
      attachResultToInvocation(invocations, toolName, result)
    }
  }

  return invocations
}

const attachResultToInvocation = (
  invocations: ToolInvocation[],
  toolName: string,
  result: string,
): void => {
  const target = [...invocations]
    .toReversed()
    .find((inv) => inv.name === toolName && inv.result === undefined)
  if (target !== undefined) {
    const idx = invocations.indexOf(target)
    invocations[idx] = { ...target, result }
  } else {
    invocations.push({ name: toolName, args: {}, result })
  }
}

const extractToolInvocations = (transcript: unknown): ToolInvocation[] => {
  if (transcript === null || transcript === undefined) {
    return []
  }
  if (!isArray(transcript)) {
    throw new Error(
      `trace-adapter: transcript is not an array (got ${typeof transcript}) — cannot extract tool invocations`,
    )
  }

  const turns: ConversationTurn[] = []
  for (const rawTurn of transcript) {
    if (!isRecord(rawTurn)) {
      throw new Error(
        `trace-adapter: transcript turn is not an object (got ${typeof rawTurn})`,
      )
    }
    turns.push(rawTurn)
  }

  return extractToolInvocationsFromTurns(turns)
}

const extractOutboundPayloadsFromTurns = (
  turns: readonly ConversationTurn[],
): OutboundPayload[] => {
  const payloads: OutboundPayload[] = []
  for (const turn of turns) {
    if (turn.outbound && isRecord(turn.outbound)) {
      const kind = stringifyUnknown(turn.outbound.kind)
      const content = stringifyUnknown(turn.outbound.content)
      if (kind && content) {
        payloads.push({ kind: normalizeOutboundKind(kind), content })
      }
    }
  }
  return payloads
}

const extractOutboundPayloads = (transcript: unknown): OutboundPayload[] => {
  if (!isArray(transcript)) {
    return []
  }
  const turns = parseTurns(transcript)
  return extractOutboundPayloadsFromTurns(turns)
}

const extractFilesystemDiffsFromTurns = (
  turns: readonly ConversationTurn[],
): FilesystemDiff[] => {
  const diffs: FilesystemDiff[] = []
  for (const turn of turns) {
    if (!isArray(turn.filesystem_diffs)) {
      continue
    }
    for (const rawDiff of turn.filesystem_diffs) {
      if (!isRecord(rawDiff)) {
        throw new Error('trace-adapter: filesystem_diff entry is not an object')
      }
      const fp = stringifyUnknown(rawDiff.path)
      const status = stringifyUnknown(rawDiff.status)
      if (fp) {
        diffs.push({ path: fp, status: normalizeFilesystemStatus(status) })
      }
    }
  }
  return diffs
}

const extractFilesystemDiffs = (transcript: unknown): FilesystemDiff[] => {
  if (!isArray(transcript)) {
    return []
  }
  const turns = parseTurns(transcript)
  return extractFilesystemDiffsFromTurns(turns)
}

const parseTurns = (transcript: unknown): ConversationTurn[] => {
  if (!isArray(transcript)) {
    return []
  }
  const turns: ConversationTurn[] = []
  for (const rawTurn of transcript) {
    if (!isRecord(rawTurn)) {
      throw new Error(
        `trace-adapter: transcript turn is not an object (got ${typeof rawTurn})`,
      )
    }
    turns.push(rawTurn)
  }
  return turns
}

const findTranscriptFile = (
  transcriptDir: string,
  taskId: string,
): TranscriptFile | null => {
  if (!existsSync(transcriptDir)) {
    return null
  }
  const files = readdirSync(transcriptDir).filter((f) => f.endsWith('.json'))
  const exact = files.find((f) => f.includes(taskId))
  if (!exact) {
    return null
  }
  const raw = readFileSync(path.join(transcriptDir, exact), 'utf8')
  try {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unsafe-type-assertion -- JSON.parse returns unknown, assertion is necessary at boundary
    return JSON.parse(raw) as TranscriptFile
  } catch {
    throw new Error(`trace-adapter: failed to parse transcript file ${exact}`)
  }
}

const parseResults = (resultsPath: string): WazaResults => {
  if (!existsSync(resultsPath)) {
    throw new Error(`trace-adapter: results file not found: ${resultsPath}`)
  }
  const raw = readFileSync(resultsPath, 'utf8')
  try {
    // eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unsafe-type-assertion -- JSON.parse returns unknown, assertion is necessary at boundary
    return JSON.parse(raw) as WazaResults
  } catch {
    throw new Error(
      `trace-adapter: failed to parse results JSON: ${resultsPath}`,
    )
  }
}

// ── adapter ──────────────────────────────────────────────────────

export type AdapterResult = {
  readonly traces: readonly EvalTrace[]
  readonly taskCount: number
}

export type AdapterOptions = {
  readonly resultsPath: string
  readonly transcriptDir?: string
  readonly requestIntent: RequestIntent
}

const buildTraceFromTask = (
  task: WazaResultTask,
  options: AdapterOptions,
): EvalTrace => {
  const taskId = task.test_id ?? task.display_name ?? ''
  if (!taskId) {
    throw new Error('trace-adapter: task has no test_id or display_name')
  }

  const transcript = options.transcriptDir
    ? findTranscriptFile(options.transcriptDir, taskId)
    : null

  const run = task.runs?.[0]
  if (!run) {
    throw new Error(`trace-adapter: task "${taskId}" has no runs`)
  }

  const finalOutput =
    transcript?.final_output ?? run.final_output ?? run.output ?? ''

  const transcriptData = transcript?.transcript ?? run.transcript
  const toolInvocations = extractToolInvocations(transcriptData)
  const outboundPayloads = extractOutboundPayloads(transcriptData)
  const filesystemDiffs = extractFilesystemDiffs(transcriptData)

  return {
    request_intent: options.requestIntent,
    final_output: finalOutput,
    tool_invocations: toolInvocations,
    outbound_payloads:
      outboundPayloads.length > 0 ? outboundPayloads : undefined,
    filesystem_diffs: filesystemDiffs.length > 0 ? filesystemDiffs : undefined,
  }
}

export const adaptWazaToTraces = (options: AdapterOptions): AdapterResult => {
  const results = parseResults(options.resultsPath)
  const tasks = results.tasks ?? []

  if (tasks.length === 0) {
    throw new Error(
      'trace-adapter: results JSON has no tasks — cannot produce traces',
    )
  }

  const traces = tasks.map((task) => buildTraceFromTask(task, options))

  return { traces, taskCount: tasks.length }
}
