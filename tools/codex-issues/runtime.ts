import { spawn } from 'node:child_process'
import { existsSync, lstatSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export type InvocationOptions = {
  workspace: string
  allowedPaths: string[]
  model: string
  effort: string
  readRoots: string[]
  denyReadPaths?: string[]
}

function canonicalWorkspace(workspace: string): string {
  if (!path.isAbsolute(workspace) || !lstatSync(workspace).isDirectory()) {
    throw new Error('Workspace must be an absolute directory')
  }
  return realpathSync(workspace)
}

function contains(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  )
}

function unsafeLiteralPath(value: string): boolean {
  for (const character of value) {
    if (
      (character.codePointAt(0) ?? 0) < 32 ||
      '*?[]{}\\'.includes(character)
    ) {
      return true
    }
  }
  return false
}

function allowedFiles(workspace: string, paths: string[]): string[] {
  const files = paths.map((file) => {
    if (
      path.isAbsolute(file) ||
      unsafeLiteralPath(file) ||
      file.split('/').some((part) => !part || part === '.' || part === '..') ||
      ['.git', '.codex', '.agent-tmp'].includes(file.split('/')[0] ?? '')
    ) {
      throw new Error('Invalid allowed file path')
    }
    const absolute = path.join(workspace, file)
    const stat = lstatSync(absolute)
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      realpathSync(absolute) !== absolute
    ) {
      throw new Error('Allowed path must be a regular file without symlinks')
    }
    return absolute
  })
  if (new Set(files).size !== files.length) {
    throw new Error('Duplicate allowed file path')
  }
  return files
}

function readPermissions(
  workspace: string,
  roots: string[],
): Map<string, string> {
  const permissions = new Map<string, string>([[':minimal', 'read']])
  for (const root of roots) {
    if (!path.isAbsolute(root) || unsafeLiteralPath(root)) {
      throw new Error('Runtime read root must be an absolute literal path')
    }
    const realRoot = realpathSync(root)
    const configuredAuthHome = path.resolve(
      process.env.CODEX_HOME ?? path.join(process.env.HOME ?? '/', '.codex'),
    )
    const authHome = existsSync(configuredAuthHome)
      ? realpathSync(configuredAuthHome)
      : configuredAuthHome
    const configuredHome = process.env.HOME
    const privateHome =
      configuredHome && existsSync(configuredHome)
        ? realpathSync(configuredHome)
        : configuredHome
    if (
      realRoot === path.parse(realRoot).root ||
      realRoot === privateHome ||
      contains(realRoot, workspace) ||
      contains(realRoot, authHome) ||
      contains(authHome, realRoot)
    ) {
      throw new Error(
        'Runtime read root would expose private parent or auth data',
      )
    }
    permissions.set(realRoot, 'read')
  }
  return permissions
}

function permissionArguments(
  workspace: string,
  readRoots: string[],
  writes: string[],
  denyReadPaths: string[],
): string[] {
  const permissions = readPermissions(workspace, readRoots)
  const temporaryRoots = [
    tmpdir(),
    ...(process.platform === 'win32' ? [] : ['/tmp']),
  ]
  const hostRoots = [process.env.HOME, process.env.CODEX_HOME].filter(
    (value): value is string => value !== undefined,
  )
  for (const root of [...temporaryRoots, ...hostRoots, ...denyReadPaths]) {
    if (!path.isAbsolute(root) || unsafeLiteralPath(root)) {
      throw new Error('Denied read path must be an absolute literal path')
    }
    const canonical = existsSync(root)
      ? realpathSync(root)
      : path.join(realpathSync(path.dirname(root)), path.basename(root))
    permissions.set(canonical, 'deny')
  }
  // A narrower runtime root can override its denied home/temp parent.
  for (const root of readRoots) {
    permissions.set(realpathSync(root), 'read')
  }
  permissions.set(workspace, 'read')
  for (const file of writes) {
    permissions.set(file, 'write')
  }
  permissions.set(path.join(workspace, '.agent-tmp'), 'write')
  permissions.set(path.join(workspace, '.git'), 'deny')
  permissions.set(path.join(workspace, '.codex'), 'deny')
  const table = [...permissions]
    .map(([key, value]) => `${JSON.stringify(key)}=${JSON.stringify(value)}`)
    .join(',')
  return [
    '-c',
    'default_permissions="issue_eval"',
    '-c',
    `permissions.issue_eval.filesystem={${table}}`,
    '-c',
    'permissions.issue_eval.network.enabled=false',
  ]
}

export function buildArguments(options: InvocationOptions): string[] {
  const workspace = canonicalWorkspace(options.workspace)
  const writes = allowedFiles(workspace, options.allowedPaths)
  if (
    !options.model.trim() ||
    ![
      'none',
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
      'ultra',
    ].includes(options.effort)
  ) {
    throw new Error('Explicit model and supported effort are required')
  }
  const shellEnvironment = {
    PATH: process.env.PATH ?? '/usr/bin:/bin',
    TMPDIR: path.join(workspace, '.agent-tmp'),
    LANG: 'C.UTF-8',
    SWC_NATIVE_BINDING_CACHE: path.join(workspace, '.agent-tmp/swc'),
  }
  const overrides = [
    `model=${JSON.stringify(options.model)}`,
    `model_reasoning_effort=${JSON.stringify(options.effort)}`,
    'model_provider="openai"',
    'forced_login_method="chatgpt"',
    'allow_login_shell=false',
    'shell_environment_policy.inherit="none"',
    `shell_environment_policy.set={${Object.entries(shellEnvironment)
      .map(([key, value]) => `${JSON.stringify(key)}=${JSON.stringify(value)}`)
      .join(',')}}`,
    'mcp_servers={}',
    'web_search="disabled"',
    `projects={${JSON.stringify(workspace)}={trust_level="untrusted"}}`,
    ...[
      'hooks',
      'plugins',
      'remote_plugin',
      'apps',
      'browser_use',
      'browser_use_external',
      'computer_use',
      'in_app_browser',
      'multi_agent',
      'memories',
      'skill_search',
      'skill_mcp_dependency_install',
      'tool_suggest',
      'shell_snapshot',
    ].map((feature) => `features.${feature}=false`),
  ]
  return [
    '--no-daemon',
    '--strict-config',
    '--ask-for-approval',
    'never',
    ...permissionArguments(
      workspace,
      options.readRoots,
      writes,
      options.denyReadPaths ?? [],
    ),
    ...overrides.flatMap((override) => ['-c', override]),
    'exec',
    '--ignore-user-config',
    '--ignore-rules',
    '--ephemeral',
    '--skip-git-repo-check',
    '--cd',
    workspace,
    '--json',
    '-',
  ]
}

export function buildSandboxArguments(
  workspace: string,
  readRoots: string[],
  denyReadPaths: string[] = [],
): string[] {
  const canonical = canonicalWorkspace(workspace)
  return [
    ...permissionArguments(canonical, readRoots, [], denyReadPaths),
    '-c',
    `projects={${JSON.stringify(canonical)}={trust_level="untrusted"}}`,
    'sandbox',
    '-P',
    'issue_eval',
    '-C',
    canonical,
    '--',
  ]
}

export type EventSummary = {
  completed: boolean
  inputTokens: number | null
  cachedInputTokens: number | null
  outputTokens: number | null
  toolCalls: number
  retries: number
  invalidEvents: boolean
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseEvent(
  line: string,
): (Record<string, unknown> & { type: string }) | null {
  try {
    const value: unknown = JSON.parse(line)
    if (object(value) && typeof value.type === 'string' && value.type) {
      return { ...value, type: value.type }
    }
  } catch {
    return null
  }
  return null
}

function tokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

type TokenField = 'inputTokens' | 'cachedInputTokens' | 'outputTokens'

function accumulateToken(
  summary: EventSummary,
  unknown: Set<TokenField>,
  field: TokenField,
  value: unknown,
): void {
  if (unknown.has(field)) {
    return
  }
  const total = tokenCount(value) ? (summary[field] ?? 0) + value : null
  if (total === null || !Number.isSafeInteger(total)) {
    summary[field] = null
    unknown.add(field)
    summary.invalidEvents = true
    return
  }
  summary[field] = total
}

function accumulateUsage(
  summary: EventSummary,
  unknown: Set<TokenField>,
  value: unknown,
): void {
  const usage = object(value) ? value : {}
  accumulateToken(summary, unknown, 'inputTokens', usage.input_tokens)
  accumulateToken(
    summary,
    unknown,
    'cachedInputTokens',
    usage.cached_input_tokens,
  )
  accumulateToken(summary, unknown, 'outputTokens', usage.output_tokens)
  if (
    tokenCount(usage.input_tokens) &&
    tokenCount(usage.cached_input_tokens) &&
    usage.cached_input_tokens > usage.input_tokens
  ) {
    summary.cachedInputTokens = null
    unknown.add('cachedInputTokens')
    summary.invalidEvents = true
  }
}

function observeTool(
  summary: EventSummary,
  toolIds: Set<string>,
  event: Record<string, unknown> & { type: string },
): void {
  if (!event.type.startsWith('item.') || !object(event.item)) {
    return
  }
  const item = event.item
  if (
    ![
      'command_execution',
      'mcp_tool_call',
      'file_change',
      'web_search',
    ].includes(String(item.type))
  ) {
    return
  }
  if (typeof item.id !== 'string' || !item.id) {
    summary.invalidEvents = true
    return
  }
  toolIds.add(item.id)
}

export function summarizeEvents(jsonl: string): EventSummary {
  const summary: EventSummary = {
    completed: false,
    inputTokens: null,
    cachedInputTokens: null,
    outputTokens: null,
    toolCalls: 0,
    retries: 0,
    invalidEvents: false,
  }
  const toolIds = new Set<string>()
  const unknown = new Set<TokenField>()
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) {
      continue
    }
    const event = parseEvent(line)
    if (event === null) {
      summary.invalidEvents = true
      continue
    }
    if (event.type === 'turn.started' || event.type === 'turn.failed') {
      summary.completed = false
    }
    if (event.type === 'turn.completed') {
      summary.completed = true
      accumulateUsage(summary, unknown, event.usage)
    }
    if (
      event.type === 'error' &&
      typeof event.message === 'string' &&
      /reconnect|retry/iu.test(event.message)
    ) {
      summary.retries += 1
    }
    observeTool(summary, toolIds, event)
  }
  summary.toolCalls = toolIds.size
  if (!summary.completed) {
    summary.inputTokens = null
    summary.cachedInputTokens = null
    summary.outputTokens = null
  }
  return summary
}

export function sanitizedEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {}
  for (const key of [
    'PATH',
    'HOME',
    'CODEX_HOME',
    'USER',
    'LOGNAME',
    'SHELL',
    'LANG',
    'LC_ALL',
    'LC_CTYPE',
    'TERM',
    'TMPDIR',
    'SYSTEMROOT',
    'WINDIR',
  ]) {
    if (process.env[key] !== undefined) {
      environment[key] = process.env[key]
    }
  }
  return environment
}

export type ProcessOptions = {
  cwd: string
  env?: NodeJS.ProcessEnv
  input?: string
  timeoutMs: number
  maxOutputBytes?: number
}

export type ProcessResult = {
  exitCode: number | null
  elapsedMs: number
  stdout: string
  stderr: string
  timedOut: boolean
  outputLimit: boolean
}

function boundedText(chunks: Buffer[]): string {
  const buffer = Buffer.concat(chunks)
  const decoded = buffer.toString('utf8')
  if (Buffer.byteLength(decoded) <= buffer.length) {
    return decoded
  }
  let text = ''
  let bytes = 0
  for (const character of decoded) {
    bytes += Buffer.byteLength(character)
    if (bytes > buffer.length) {
      break
    }
    text += character
  }
  return text
}

export async function runProcess(
  command: string,
  args: string[],
  options: ProcessOptions,
): Promise<ProcessResult> {
  if (!Number.isSafeInteger(options.timeoutMs) || options.timeoutMs < 1) {
    throw new Error('Process timeout must be a positive integer')
  }
  const maxOutputBytes = options.maxOutputBytes ?? 4 * 1024 * 1024
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1) {
    throw new Error('Process output limit must be a positive integer')
  }
  const started = performance.now()
  return new Promise<ProcessResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? sanitizedEnvironment(),
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let outputBytes = 0
    let timedOut = false
    let outputLimit = false
    let settled = false
    let closed = false
    let escalated = false
    let exitCode: number | null = null
    let killTimer: ReturnType<typeof setTimeout> | undefined
    let finishTimer: ReturnType<typeof setTimeout> | undefined

    function signalGroup(signal: NodeJS.Signals): void {
      if (child.pid === undefined) {
        return
      }
      try {
        if (process.platform === 'win32') {
          child.kill(signal)
        } else {
          process.kill(-child.pid, signal)
        }
      } catch (error) {
        if (!object(error) || error.code !== 'ESRCH') {
          child.kill(signal)
        }
      }
    }

    function finish(): void {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      clearTimeout(killTimer)
      clearTimeout(finishTimer)
      child.stdin.destroy()
      child.stdout.destroy()
      child.stderr.destroy()
      resolve({
        exitCode,
        elapsedMs: Math.round(performance.now() - started),
        stdout: boundedText(stdout),
        stderr: boundedText(stderr),
        timedOut,
        outputLimit,
      })
    }

    function stop(): void {
      if (killTimer !== undefined || settled) {
        return
      }
      clearTimeout(timeout)
      signalGroup('SIGTERM')
      child.stdin.destroy()
      killTimer = setTimeout(() => {
        escalated = true
        signalGroup('SIGKILL')
        if (closed) {
          finish()
        } else {
          finishTimer = setTimeout(finish, 1000)
        }
      }, 250)
    }

    function capture(chunks: Buffer[], value: Buffer): void {
      const remaining = maxOutputBytes - outputBytes
      if (remaining > 0) {
        const accepted = value.subarray(0, remaining)
        chunks.push(accepted)
        outputBytes += accepted.length
      }
      if (value.length > remaining) {
        outputLimit = true
        stop()
      }
    }

    const timeout = setTimeout(() => {
      timedOut = true
      stop()
    }, options.timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => {
      capture(stdout, chunk)
    })
    child.stderr.on('data', (chunk: Buffer) => {
      capture(stderr, chunk)
    })
    child.stdin.on('error', () => child.stdin.destroy())
    child.once('error', (error: NodeJS.ErrnoException) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeout)
      clearTimeout(killTimer)
      clearTimeout(finishTimer)
      signalGroup('SIGKILL')
      reject(new Error(`Unable to start process (${error.code ?? 'unknown'})`))
    })
    child.once('close', (code) => {
      closed = true
      exitCode = code
      clearTimeout(timeout)
      if (killTimer !== undefined) {
        if (escalated) {
          finish()
        }
        return
      }
      // Terminate remaining members of this invocation process group.
      signalGroup('SIGTERM')
      killTimer = setTimeout(() => {
        signalGroup('SIGKILL')
        finish()
      }, 250)
    })
    child.stdin.end(options.input)
  })
}
