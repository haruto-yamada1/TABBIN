import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { closeSync, existsSync, readFileSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'

import {
  contextModeOverrides,
  contextModeRuntime,
  createPrivateOutput,
  privateDirectory,
  privateRawFile,
  selectBenchmarkNode,
  writePrivate,
} from './benchmark-codex-context-runtime'
import type { ContextModeRuntime } from './benchmark-codex-context-runtime'

export type BenchmarkVariant = 'A' | 'B' | 'C' | 'D'

type EventSummary = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  toolCalls: number
  retries: number
  completed: boolean
  answer: unknown
}

type AnonymousRecord = {
  id: string
  bucket: number
  active: boolean
  weight: number
  description: string
}

export function buildCodexArguments(
  variant: BenchmarkVariant,
  workspace: string,
  schema: string,
  port: number,
  contextMode?: ContextModeRuntime,
): string[] {
  const overrides = [
    'model_reasoning_effort="xhigh"',
    'check_for_update_on_startup=false',
    'otel.exporter="none"',
    'otel.metrics_exporter="none"',
    'otel.trace_exporter="none"',
    'sandbox_workspace_write.exclude_tmpdir_env_var=true',
    'sandbox_workspace_write.exclude_slash_tmp=true',
  ]
  if (variant !== 'A') {
    overrides.push(`openai_base_url="http://127.0.0.1:${port}/v1"`)
  }
  if (variant === 'A' || variant === 'D') {
    overrides.push(...contextModeOverrides(workspace, contextMode))
  }
  return [
    '--approve-for-me',
    ...overrides.flatMap((override) => ['--config', override]),
    'exec',
    '--ignore-user-config',
    '--ephemeral',
    '--skip-git-repo-check',
    '--sandbox',
    'workspace-write',
    '--model',
    'gpt-6.1-sol',
    '--cd',
    workspace,
    '--output-schema',
    schema,
    '--json',
    '-',
  ]
}

function object(value: unknown): Record<string, unknown> {
  return isObject(value) ? value : {}
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function number(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export function summarizeCodexEvents(events: string): EventSummary {
  const summary: EventSummary = {
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    toolCalls: 0,
    retries: 0,
    completed: false,
    answer: null,
  }
  const tools = new Set<string>()
  for (const line of events.split('\n')) {
    let event: Record<string, unknown>
    try {
      event = object(JSON.parse(line))
    } catch {
      continue
    }
    if (event.type === 'turn.completed') {
      const usage = object(event.usage)
      summary.inputTokens += number(usage.input_tokens)
      summary.cachedInputTokens += number(usage.cached_input_tokens)
      summary.outputTokens += number(usage.output_tokens)
      summary.completed = true
    }
    if (event.type === 'turn.failed') {
      summary.completed = false
    }
    if (
      event.type === 'error' &&
      /reconnect|retry/iu.test(String(event.message))
    ) {
      summary.retries += 1
    }
    const item = object(event.item)
    if (
      typeof item.id === 'string' &&
      (item.type === 'command_execution' || item.type === 'mcp_tool_call')
    ) {
      tools.add(item.id)
    }
    if (event.type === 'item.completed' && item.type === 'agent_message') {
      try {
        summary.answer = JSON.parse(String(item.text))
      } catch {
        summary.answer = null
      }
    }
  }
  summary.toolCalls = tools.size
  return summary
}

export function anonymousRecords(count = 4096): AnonymousRecord[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `record-${String(index).padStart(5, '0')}`,
    bucket: index % 17,
    active: index % 3 !== 0,
    weight: (index * 7) % 101,
    description: `Synthetic benchmark entry ${index}; no user data, hostnames, credentials or identifiers.`,
  }))
}

export function recordGroundTruth(records: AnonymousRecord[]) {
  const selected = records.filter(
    (record) => record.bucket === 4 && record.active && record.weight >= 73,
  )
  return {
    jsonCount: selected.length,
    jsonWeightSum: selected.reduce((sum, record) => sum + record.weight, 0),
    jsonIds: selected.map((record) => record.id).toSorted(),
  }
}

const sourceFiles = [
  'docs/architecture/ddd.md',
  'docs/architecture/indexeddb-persistence.md',
  'src/contexts/saved-tabs/domain/entities/PersistenceModelV2.ts',
  'src/contexts/saved-tabs/domain/entities/PersistenceModelV2.test.ts',
] as const
const sourceModel = sourceFiles[2]
const nearbyTest = sourceFiles[3]

function checkedGit(root: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error('Public source snapshot unavailable')
  }
  return result.stdout
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

export function fixtureTestCommand(node: string, vitest: string): string {
  return `${shellQuote(node)} ${shellQuote(vitest)} run --config vitest.config.ts --configLoader=native --project=node`
}

function prepareWorkload(root: string, output: string) {
  const revision = checkedGit(root, ['rev-parse', 'HEAD']).trim()
  const workspace = path.join(output, 'workload')
  const selectedNode = selectBenchmarkNode(
    checkedGit(root, ['show', `${revision}:.node-version`]),
  )
  const hash = createHash('sha256')
  let modelSource = ''
  for (const file of sourceFiles) {
    const source = checkedGit(root, ['show', `${revision}:${file}`])
    hash.update(file).update(source)
    writePrivate(path.join(workspace, 'repo', file), source)
    if (file === sourceModel) {
      modelSource = source
    }
  }
  const records = anonymousRecords()
  const data = JSON.stringify(records, null, 2)
  hash.update(data)
  writePrivate(path.join(workspace, 'records.json'), data)
  writePrivate(
    path.join(workspace, 'fixtures', 'boundary.ts'),
    'export function inclusiveCount(count: number): number {\n  // A deliberate diagnostic fixture; do not edit.\n  return Math.max(0, count - 1)\n}\n',
  )
  writePrivate(
    path.join(workspace, 'fixtures', 'boundary.test.ts'),
    `import { expect, it } from 'vitest'\nimport { inclusiveCount } from './boundary'\n${Array.from(
      { length: 160 },
      (_, index) =>
        `it('unrelated-case-${index}', () => expect(${index}).toBe(${index}))`,
    ).join(
      '\n',
    )}\nit('inclusive-boundary', () => expect(inclusiveCount(7)).toBe(7))\n`,
  )
  writePrivate(
    path.join(workspace, 'boundary.diff'),
    '--- boundary-before.ts\n+++ fixtures/boundary.ts\n@@ -1,4 +1,4 @@\n export function inclusiveCount(count: number): number {\n   // A deliberate diagnostic fixture; do not edit.\n-  return Math.max(0, count)\n+  return Math.max(0, count - 1)\n }\n',
  )
  writePrivate(
    path.join(workspace, 'package.json'),
    JSON.stringify({
      private: true,
      type: 'module',
      scripts: {
        'test:node': fixtureTestCommand(
          selectedNode,
          path.join(workspace, 'node_modules', 'vitest', 'vitest.mjs'),
        ),
      },
    }),
  )
  writePrivate(
    path.join(workspace, 'vitest.config.ts'),
    "import path from 'node:path'\nimport { defineConfig } from 'vitest/config'\nexport default defineConfig({ cacheDir: path.resolve(import.meta.dirname, '.vite-cache'), test: { projects: [{ test: { name: 'node', environment: 'node', include: ['repo/**/*.test.ts', 'fixtures/**/*.test.ts'] } }] } })\n",
  )
  const modules = path.join(workspace, 'node_modules')
  if (!existsSync(modules)) {
    symlinkSync(path.join(root, 'node_modules'), modules)
  }
  const snapshotType = modelSource
    .split('export type PersistenceV2Snapshot = {')[1]
    ?.split('}')[0]
  if (!snapshotType) {
    throw new Error('Persistence snapshot contract changed')
  }
  const snapshotFields = Array.from(snapshotType.matchAll(/readonly (\w+):/gu))
    .map((match) => match[1] ?? '')
    .toSorted((left, right) => left.localeCompare(right))
  const expected = {
    nearbyTestExitCode: 0,
    fixtureTestExitCode: 1,
    failureCase: 'inclusive-boundary',
    failureSourceLine: 3,
    ...recordGroundTruth(records),
    snapshotFields,
    databaseVersion: 1,
    crossEngineAtomic: false,
  }
  const properties = Object.fromEntries(
    Object.entries(expected).map(([key, value]) => [
      key,
      Array.isArray(value)
        ? { type: 'array', items: { type: 'string' } }
        : { type: typeof value === 'number' ? 'integer' : typeof value },
    ]),
  )
  const schema = path.join(output, 'answer-schema.json')
  writePrivate(
    schema,
    JSON.stringify({
      type: 'object',
      additionalProperties: false,
      properties,
      required: Object.keys(properties),
    }),
  )
  return {
    workspace,
    selectedNode,
    schema,
    revision,
    inputHash: hash.digest('hex'),
    expected,
  }
}

function promptFor(variant: BenchmarkVariant): string {
  let routing =
    'Use native shell tools for reads, searches and tests; do not add wrappers, MCPs or hooks.'
  if (variant === 'A') {
    routing =
      'Use the existing routing policy: context-mode is required for large file reads, data analysis, aggregation and bulk searches; use RTK for shell commands, with native tools allowed only for short fixed output. No package installs, web fetching, hooks or global configuration changes.'
  } else if (variant === 'D') {
    routing =
      'For bulk reads, filtering and JSON aggregation, use context-mode ctx_execute/ctx_execute_file; print only relevant evidence or aggregates. Use RTK for long test CLI output. Never use context-mode web fetching or telemetry.'
  } else if (variant === 'C') {
    routing =
      'Use RTK for CLI commands whose output is long (particularly test output). For source reads and JSON data, use native shell tools. Do not add MCPs or hooks.'
  }
  return `Perform this fixed, read-only local benchmark. No network actions, package installs, edits, credential reads, environment inspection, host data discovery, or configuration changes. The only task data are this synthetic workspace and its public repo snapshot. Do not inspect symlink targets, home directories, auth files, or other chats. ${routing}

Complete all tasks; report only the requested JSON object. Do not include conversation text, URLs, absolute paths, personal data or additional commentary in the final answer.
1. Run the nearest real TABBIN node test: bun run test:node -- repo/${nearbyTest}. Record its exit code.
2. Run bun run test:node -- fixtures/boundary.test.ts --reporter=verbose. A deliberate assertion failure exists; diagnose it from the test result, fixtures/boundary.ts and boundary.diff. Return the failing test name and the exact changed source line. Do not fix the fixture.
3. From all records.json entries select bucket=4, active=true and weight>=73. Return exact count, sum of weights, and every selected id sorted lexicographically. The file is large; handle completeness and truncation correctly.
4. Read repo/docs/architecture/ddd.md, repo/docs/architecture/indexeddb-persistence.md and repo/${sourceModel}. Return the sorted direct property names of PersistenceV2Snapshot, physical database version, and whether a cross-engine atomic transaction with Chrome storage is claimed.
Use real local evidence. For an unsuccessful task, preserve the observed result instead of inventing a pass.\n`
}

export function scoreAnswer(
  answer: unknown,
  expected: Record<string, unknown>,
) {
  const observed = object(answer)
  const checks = Object.fromEntries(
    Object.entries(expected).map(([key, value]) => [
      key,
      JSON.stringify(observed[key]) === JSON.stringify(value),
    ]),
  )
  return {
    checksPassed: Object.values(checks).filter(Boolean).length,
    checksTotal: Object.keys(checks).length,
    allCorrect: Object.values(checks).every(Boolean),
    countCorrect: checks.jsonCount,
    idsCorrect: checks.jsonIds,
    sourceAndDiffCorrect: checks.failureSourceLine && checks.snapshotFields,
  }
}

async function proxyStats(port: number) {
  const response = await fetch(`http://127.0.0.1:${port}/stats`, {
    signal: AbortSignal.timeout(2000),
  })
  if (!response.ok) {
    throw new Error('Dedicated proxy stats unavailable')
  }
  return readProxyCounters(await response.json())
}

export function readProxyCounters(value: unknown) {
  const stats = object(value)
  const requests = object(stats.requests)
  return {
    apiRequests: number(object(stats.summary).api_requests),
    requestsTotal: number(requests.total),
    requestsFailed: number(requests.failed),
  }
}

async function runCodex(
  args: string[],
  prompt: string,
  env: NodeJS.ProcessEnv,
  output: string,
  timeoutMs: number,
) {
  const stdoutFile = path.join(output, 'events.jsonl')
  const stderrFile = path.join(output, 'stderr.log')
  const stdout = privateRawFile(stdoutFile)
  const stderr = privateRawFile(stderrFile)
  const started = performance.now()
  let timedOut = false
  const child = spawn('codex', args, {
    env,
    stdio: ['pipe', stdout, stderr],
    detached: true,
  })
  const finished = new Promise<{ exitCode: number | null }>(
    (resolve, reject) => {
      child.on('error', reject)
      child.on('close', (exitCode) => {
        resolve({ exitCode })
      })
    },
  )
  const timer = setTimeout(() => {
    timedOut = true
    try {
      if (child.pid) {
        process.kill(-child.pid, 'SIGTERM')
      }
    } catch {
      child.kill('SIGTERM')
    }
  }, timeoutMs)
  child.stdin?.end(prompt)
  const result = await finished.finally(() => {
    clearTimeout(timer)
    closeSync(stdout)
    closeSync(stderr)
  })
  const events = readFileSync(stdoutFile, 'utf8')
  const stderrText = readFileSync(stderrFile, 'utf8')
  const summary = summarizeCodexEvents(events)
  const reconnects = stderrText.match(/Reconnecting \d+\/\d+/gu)?.length ?? 0
  summary.retries = Math.max(summary.retries, reconnects)
  return {
    ...result,
    timedOut,
    elapsedMs: Math.round(performance.now() - started),
    ...summary,
  }
}

type BenchmarkOptions = {
  root: string
  output: string
  run: boolean
  repetitions: number
  port: number
  timeoutMs: number
  variants: BenchmarkVariant[]
  headroom: string
  contextModeServer: string | undefined
}

function validNumber(value: string, minimum: number, maximum: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error('Invalid benchmark numeric parameter')
  }
  return parsed
}

function isVariant(value: string): value is BenchmarkVariant {
  return value === 'A' || value === 'B' || value === 'C' || value === 'D'
}

function parseBenchmarkOptions(): BenchmarkOptions {
  const { values } = parseArgs({
    options: {
      run: { type: 'boolean', default: false },
      output: { type: 'string' },
      repetitions: { type: 'string', default: '2' },
      variants: { type: 'string', default: 'A,B,C,D' },
      port: { type: 'string', default: '18790' },
      headroom: {
        type: 'string',
        default: 'headroom',
      },
      timeout: { type: 'string', default: '360000' },
      'context-mode-server': { type: 'string' },
    },
    allowPositionals: false,
  })
  const output = createPrivateOutput(
    path.resolve(
      values.output ??
        path.join(tmpdir(), `tabbin-codex-context-${Date.now()}`),
    ),
  )
  const selectedVariants = values.variants.split(',')
  const variants = selectedVariants.filter(isVariant)
  if (variants.length === 0 || variants.length !== selectedVariants.length) {
    throw new Error('Invalid benchmark variants')
  }
  return {
    root: path.resolve(import.meta.dirname, '../..'),
    output,
    run: values.run,
    repetitions: validNumber(values.repetitions, 1, 5),
    port: validNumber(values.port, 1024, 65535),
    timeoutMs: validNumber(values.timeout, 1000, 1800000),
    variants,
    headroom: values.headroom,
    contextModeServer: values['context-mode-server'],
  }
}

export function benchmarkEnvironment(
  output: string,
  parentEnvironment: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  if (
    parentEnvironment.CODEX_API_KEY?.trim() ||
    parentEnvironment.OPENAI_API_KEY?.trim()
  ) {
    throw new Error(
      'Benchmark refuses an environment API key authentication override',
    )
  }
  const temporaryDirectory = path.join(output, 'workload', '.tmp')
  privateDirectory(temporaryDirectory)
  const env: NodeJS.ProcessEnv = {
    ...parentEnvironment,
    TMPDIR: temporaryDirectory,
    HEADROOM_MODE: 'cache',
    HEADROOM_LOSSLESS: '1',
    HEADROOM_DISABLE_KOMPRESS: '1',
    HEADROOM_BEACON: 'off',
    HEADROOM_TELEMETRY: 'off',
    HEADROOM_UPDATE_CHECK: 'off',
    HEADROOM_USAGE_REPORTING: '0',
    LITELLM_LOCAL_MODEL_COST_MAP: 'True',
    HEADROOM_STATELESS: '1',
    HEADROOM_NO_SUBSCRIPTION_TRACKING: '1',
    HEADROOM_WORKSPACE_DIR: path.join(output, 'headroom-state'),
    HEADROOM_CONFIG_DIR: path.join(output, 'headroom-config'),
    HEADROOM_HOST: '127.0.0.1',
    HEADROOM_CODE_MEMORY: 'none',
    HEADROOM_CODEX_WIRE_DEBUG: '0',
    HEADROOM_LOG_MESSAGES: '0',
    HEADROOM_WRAP_QUIET: '0',
    HEADROOM_WRAP_OWNED: '0',
    HF_HUB_OFFLINE: '1',
    TRANSFORMERS_OFFLINE: '1',
    DO_NOT_TRACK: '1',
  }
  delete env.HEADROOM_PROBE_RECORD_DIR
  delete env.HEADROOM_PROXY_CONFIG_JSON
  delete env.HEADROOM_WORKERS
  delete env.CODEX_API_KEY
  delete env.OPENAI_API_KEY
  return env
}

async function awaitProxyReady(
  proxy: ReturnType<typeof spawn>,
  port: number,
  failedToSpawn: () => boolean,
  attempts = 60,
): Promise<void> {
  if (
    failedToSpawn() ||
    proxy.exitCode !== null ||
    proxy.signalCode !== null ||
    attempts <= 0
  ) {
    throw new Error(
      'Dedicated proxy did not become ready; diagnostics retained privately',
    )
  }
  try {
    await proxyStats(port)
  } catch {
    await new Promise((resolve) => setTimeout(resolve, 500))
    return awaitProxyReady(proxy, port, failedToSpawn, attempts - 1)
  }
  if (failedToSpawn()) {
    throw new Error('Dedicated proxy failed to start')
  }
}

async function startDedicatedProxy(
  options: BenchmarkOptions,
  env: NodeJS.ProcessEnv,
) {
  let occupied = false
  try {
    await proxyStats(options.port)
    occupied = true
  } catch {
    // Connection failure means there is no compatible running proxy.
  }
  if (occupied) {
    throw new Error('Benchmark requires an unused dedicated proxy port')
  }
  const log = privateRawFile(path.join(options.output, 'proxy.log'))
  const proxy = spawn(
    options.headroom,
    [
      'proxy',
      '--port',
      String(options.port),
      '--host',
      '127.0.0.1',
      '--mode',
      'cache',
      '--stateless',
      '--no-telemetry',
    ],
    { env, stdio: ['ignore', log, log] },
  )
  let spawnFailed = false
  proxy.on('error', () => {
    spawnFailed = true
  })
  closeSync(log)
  try {
    await awaitProxyReady(proxy, options.port, () => spawnFailed)
  } catch (error) {
    proxy.kill('SIGTERM')
    throw error
  }
  return proxy
}

async function measureVariant(
  variant: BenchmarkVariant,
  repetition: number,
  options: BenchmarkOptions,
  workload: ReturnType<typeof prepareWorkload>,
  env: NodeJS.ProcessEnv,
) {
  const runOutput = path.join(options.output, `${variant}-${repetition}`)
  privateDirectory(runOutput)
  const contextMode =
    variant === 'A' || variant === 'D'
      ? contextModeRuntime(options, runOutput)
      : undefined
  const before = variant === 'A' ? null : await proxyStats(options.port)
  const result = await runCodex(
    buildCodexArguments(
      variant,
      workload.workspace,
      workload.schema,
      options.port,
      contextMode,
    ),
    promptFor(variant),
    env,
    runOutput,
    options.timeoutMs,
  )
  const after = variant === 'A' ? null : await proxyStats(options.port)
  const { answer, ...usage } = result
  return {
    variant,
    repetition,
    ...usage,
    uncachedInputTokens: usage.inputTokens - usage.cachedInputTokens,
    ...scoreAnswer(answer, workload.expected),
    proxyApiRequests:
      before && after ? after.apiRequests - before.apiRequests : null,
    proxyFailedRequests:
      before && after ? after.requestsFailed - before.requestsFailed : null,
    routeVerified:
      variant === 'A' ||
      Boolean(before && after && after.apiRequests > before.apiRequests),
  }
}

async function runMeasurements(
  options: BenchmarkOptions,
  workload: ReturnType<typeof prepareWorkload>,
  env: NodeJS.ProcessEnv,
) {
  const metrics: Record<string, unknown>[] = []
  const runs = Array.from({ length: options.repetitions }, (_, index) => {
    const repetition = index + 1
    const order =
      repetition % 2 === 1 ? options.variants : options.variants.toReversed()
    return order.map((variant) => ({ variant, repetition }))
  }).flat()
  // Sequential sessions share a proxy: parallel execution would corrupt attribution.
  await runs.reduce(async (previous, run) => {
    await previous
    const metric = await measureVariant(
      run.variant,
      run.repetition,
      options,
      workload,
      env,
    )
    metrics.push(metric)
    const report = {
      schemaVersion: 1,
      revision: workload.revision,
      inputHash: workload.inputHash,
      model: 'gpt-6.1-sol',
      effort: 'xhigh',
      repetitions: options.repetitions,
      metrics,
    }
    writePrivate(
      path.join(options.output, 'metrics.json'),
      `${JSON.stringify(report, null, 2)}\n`,
    )
    console.log(JSON.stringify(metric))
  }, Promise.resolve())
}

async function main() {
  process.umask(0o077)
  const options = parseBenchmarkOptions()
  const workload = prepareWorkload(options.root, options.output)
  writePrivate(
    path.join(options.output, 'ground-truth.json'),
    JSON.stringify(workload.expected, null, 2),
  )
  if (!options.run) {
    console.log(
      JSON.stringify({
        prepared: true,
        revision: workload.revision,
        inputHash: workload.inputHash,
        output: options.output,
      }),
    )
    return
  }
  if (
    options.variants.some((variant) => variant === 'A' || variant === 'D') &&
    process.platform !== 'darwin'
  ) {
    throw new Error('D requires the macOS outbound-denied process sandbox')
  }
  const env = benchmarkEnvironment(options.output)
  writePrivate(
    path.join(options.output, 'run-meta.json'),
    JSON.stringify(
      {
        repositoryRoot: options.root,
        revision: workload.revision,
        inputHash: workload.inputHash,
        model: 'gpt-6.1-sol',
        effort: 'xhigh',
        selectedNode: workload.selectedNode,
        node: spawnSync(workload.selectedNode, ['--version'], {
          env,
          encoding: 'utf8',
        }).stdout.trim(),
        bun: process.versions.bun ?? null,
        codex: spawnSync('codex', ['--version'], {
          env,
          encoding: 'utf8',
        }).stdout.trim(),
        contextModeOutboundDenied: options.variants.some(
          (variant) => variant === 'A' || variant === 'D',
        ),
        contextModeCondition:
          'Direct MCP server with private data/config/temp, cleared child environment and network/global-write denial plus new owner-only native OS executor scratch prefix; parent HOME/CODEX_HOME and global hooks preserved',
        nativeToolSandbox:
          'workspace-write limited to snapshot, standard automatic approval review',
        headroomMode: 'cache',
        headroomLossless: true,
        headroomStateless: true,
      },
      null,
      2,
    ),
  )
  const proxy = options.variants.some((variant) => variant !== 'A')
    ? await startDedicatedProxy(options, env)
    : undefined
  const heartbeat = proxy
    ? setInterval(() => {
        void proxyStats(options.port).catch(() => {})
      }, 10000)
    : undefined
  try {
    await runMeasurements(options, workload, env)
  } finally {
    clearInterval(heartbeat)
    proxy?.kill('SIGTERM')
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try {
    await main()
  } catch {
    console.error(
      'Benchmark failed; private diagnostics retained in the temporary output directory.',
    )
    process.exitCode = 1
  }
}
