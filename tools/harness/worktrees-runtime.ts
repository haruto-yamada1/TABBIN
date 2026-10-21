import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import path from 'node:path'

import { privateWorktreeDirectory } from './worktrees-io'
import type { WorktreeRecord } from './worktrees-io'
import { worktreeMcpArguments } from './worktrees-mcp'
import {
  signalWorktreeProcess,
  stopOwnedProxy,
  waitForOwnedProxy,
} from './worktrees-proxy'

type RuntimeHooks = {
  issue: number
  lock: <T>(action: () => T) => Promise<T>
  read: () => WorktreeRecord[]
  write: (record: WorktreeRecord) => void
  check: (record: WorktreeRecord) => void
  complete: (
    record: WorktreeRecord,
    tool: string,
    code: number,
    interrupted: boolean,
  ) => void
}

export function worktreePorts(slot: number) {
  return {
    headroom: 18780 + slot * 10,
    dev: 13700 + slot * 10,
    storybook: 16700 + slot * 10,
  }
}

function environment(record: WorktreeRecord) {
  const runtime = path.join(record.worktree, '.agents/harness/runtime')
  privateWorktreeDirectory(runtime)
  for (const name of [
    'tmp',
    'headroom',
    'headroom-config',
    'context-mode',
    'context-config',
  ]) {
    privateWorktreeDirectory(path.join(runtime, name))
  }
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CLAUDE_PROJECT_DIR: record.worktree,
    TABBIN_PARALLEL_WORKTREE: '1',
    CONTEXT_MODE_PROJECT_DIR: record.worktree,
    CONTEXT_MODE_DATA_DIR: path.join(runtime, 'context-mode'),
    CLAUDE_CONFIG_DIR: path.join(runtime, 'context-config'),
    HEADROOM_HOST: '127.0.0.1',
    HEADROOM_WORKSPACE_DIR: path.join(runtime, 'headroom'),
    HEADROOM_CONFIG_DIR: path.join(runtime, 'headroom-config'),
    HEADROOM_MODE: 'cache',
    HEADROOM_USAGE_REPORTING: '0',
    HEADROOM_CODE_MEMORY: 'none',
    HEADROOM_PROJECT: `issue-${record.issue}`,
    HEADROOM_BEACON: 'off',
    HEADROOM_TELEMETRY: 'off',
    HEADROOM_UPDATE_CHECK: 'off',
    HEADROOM_NO_SUBSCRIPTION_TRACKING: '1',
    LITELLM_LOCAL_MODEL_COST_MAP: 'True',
    HEADROOM_DISABLE_KOMPRESS: '1',
    HEADROOM_LOSSLESS: '1',
    HEADROOM_CODEX_WIRE_DEBUG: '0',
    HEADROOM_LOG_MESSAGES: '0',
    TMPDIR: path.join(runtime, 'tmp'),
  }
  delete env.HEADROOM_PROBE_RECORD_DIR
  delete env.HEADROOM_PROXY_CONFIG_JSON
  delete env.HEADROOM_WORKERS
  return env
}

export function worktreeTool(
  record: WorktreeRecord,
  tool: string,
  extra: string[],
) {
  const ports = worktreePorts(record.slot)
  if (tool === 'codex') {
    return {
      binary: 'codex',
      args: ['-C', record.worktree, ...extra],
      port: undefined,
    }
  }
  if (tool === 'headroom') {
    return {
      binary: 'headroom',
      args: [
        'wrap',
        'codex',
        '--port',
        String(ports.headroom),
        '--code-memory',
        'none',
        '--no-mcp',
        '--no-proxy',
        '--',
        '-C',
        record.worktree,
        ...extra,
      ],
      port: ports.headroom,
    }
  }
  if (tool === 'dev') {
    return {
      binary: 'bun',
      args: [
        'run',
        'dev',
        '--port',
        String(ports.dev),
        '--host',
        '127.0.0.1',
        ...extra,
      ],
      port: ports.dev,
    }
  }
  if (tool === 'storybook') {
    return {
      binary: 'bun',
      args: [
        'run',
        'storybook',
        '--port',
        String(ports.storybook),
        '--exact-port',
        ...extra,
      ],
      port: ports.storybook,
    }
  }
  const scripts: Record<string, string> = {
    quality: 'quality:check',
    coverage: 'test:coverage',
    e2e: 'e2e',
  }
  const script = scripts[tool]
  if (!script) {
    throw new Error(
      'unsupported tool; use codex/headroom/dev/storybook/quality/coverage/e2e',
    )
  }
  return { binary: 'bun', args: ['run', script, ...extra], port: undefined }
}

export async function portAvailable(port: number | undefined): Promise<void> {
  if (port === undefined) {
    return
  }
  await new Promise<void>((resolve, reject) => {
    const server = createServer()
    server.once('error', () => {
      reject(
        new Error('reserved port is occupied; inspect owner before starting'),
      )
    })
    server.listen(port, '127.0.0.1', () =>
      server.close(() => {
        resolve()
      }),
    )
  })
}

export async function executeWorktreeTool(
  args: string[],
  hooks: RuntimeHooks,
): Promise<void> {
  const { tool, extra } = toolArguments(args)
  const record = await hooks.lock(() => {
    const current = hooks.read().find((r) => r.issue === hooks.issue)
    if (current?.phase !== 'ready') {
      throw new Error('Issue must be ready; use resume after interruption')
    }
    hooks.check(current)
    current.phase = 'running'
    current.ownerPid = process.pid
    hooks.write(current)
    return current
  })
  const execution = { interrupted: false, proxyFailed: false }
  let exitCode = 1
  let completed = false
  let child: ReturnType<typeof spawn> | undefined
  let proxy: ReturnType<typeof spawn> | undefined
  const stop = (signal: NodeJS.Signals) => {
    execution.interrupted = true
    signalWorktreeProcess(child, signal)
    signalWorktreeProcess(proxy, signal)
  }
  const onInt = () => {
    stop('SIGINT')
  }
  const onTerm = () => {
    stop('SIGTERM')
  }
  process.on('SIGINT', onInt)
  process.on('SIGTERM', onTerm)
  try {
    const invocation = worktreeTool(record, tool, extra)
    await portAvailable(invocation.port)
    const env = environment(record)
    process.umask(0o077)
    if (tool === 'codex' || tool === 'headroom') {
      const mcpArgs = worktreeMcpArguments(record.worktree, env)
      const index = tool === 'codex' ? 0 : invocation.args.indexOf('--') + 1
      invocation.args.splice(index, 0, ...mcpArgs)
    }
    if (tool === 'headroom') {
      const port = worktreePorts(record.slot).headroom
      await hooks.lock(() => {
        proxy = spawn(
          'headroom',
          [
            'proxy',
            '--host',
            '127.0.0.1',
            '--port',
            String(port),
            '--mode',
            'cache',
          ],
          {
            cwd: record.worktree,
            stdio: 'inherit',
            env,
            detached: process.platform !== 'win32',
          },
        )
        proxy.once('error', () => {
          execution.proxyFailed = true
        })
        proxy.once('exit', () => {
          execution.proxyFailed = true
          signalWorktreeProcess(child, 'SIGTERM')
        })
        record.proxyPid = proxy.pid
        hooks.write(record)
      })
      if (!proxy) {
        throw new Error('Dedicated proxy was not launched')
      }
      await waitForOwnedProxy(
        proxy,
        port,
        () => execution.proxyFailed || execution.interrupted,
      )
    }
    if (execution.interrupted) {
      throw new Error('Issue execution was interrupted')
    }
    await hooks.lock(() => {
      child = spawn(invocation.binary, invocation.args, {
        cwd: record.worktree,
        stdio: 'inherit',
        env,
        detached: process.platform !== 'win32',
      })
      record.childPid = child.pid
      hooks.write(record)
    })
    const code = await new Promise<number>((resolve, reject) => {
      child?.once('error', () => {
        reject(new Error('tool unavailable; use an installed native tool'))
      })
      child?.once('exit', (code, signal) => {
        if (signal) {
          execution.interrupted = true
        }
        resolve(code ?? 1)
      })
    })
    exitCode = execution.proxyFailed ? 1 : code
    completed = true
    process.exitCode = exitCode
  } finally {
    process.off('SIGINT', onInt)
    process.off('SIGTERM', onTerm)
    proxy?.removeAllListeners('exit')
    if (!completed) {
      await stopOwnedProxy(child)
    }
    await stopOwnedProxy(proxy)
    record.phase =
      execution.interrupted || execution.proxyFailed ? 'paused' : 'ready'
    delete record.ownerPid
    delete record.childPid
    delete record.proxyPid
    await hooks.lock(() => {
      hooks.write(record)
      hooks.complete(record, tool, exitCode, execution.interrupted)
    })
  }
}

function toolArguments(args: string[]) {
  const toolIndex = args.indexOf('--tool')
  const tool = args[toolIndex + 1]
  if (toolIndex < 0 || !tool) {
    throw new Error('--tool is required')
  }
  const separator = args.indexOf('--')
  const extra = separator >= 0 ? args.slice(separator + 1) : []
  if (
    extra.some((arg) =>
      /^(?:-[cCpsa]|--(?:cd|port|host|config|profile|sandbox|ask-for-approval|approve-for-me|permissions|add-dir|remote|remote-auth-token-env|worktree|ignore-user-config|yolo|dangerously-bypass-hook-trust|dangerously-bypass-approvals-and-sandbox)(?:=|$))/.test(
        arg,
      ),
    )
  ) {
    throw new Error(
      'runtime/config/approval overrides are not accepted by this helper',
    )
  }
  return { tool, extra }
}
