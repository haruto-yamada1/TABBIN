import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  buildCodexArguments,
  benchmarkEnvironment,
  fixtureTestCommand,
  readProxyCounters,
  scoreAnswer,
  summarizeCodexEvents,
} from './benchmark-codex-context'
import {
  createPrivateOutput,
  selectBenchmarkNode,
  writePrivate,
} from './benchmark-codex-context-runtime'

describe('Codex context benchmark boundaries', () => {
  it('preserves raw input, cached input and output separately', () => {
    const events = [
      {
        type: 'item.started',
        item: { id: 'tool-1', type: 'command_execution' },
      },
      {
        type: 'item.completed',
        item: { id: 'tool-1', type: 'command_execution' },
      },
      { type: 'error', message: 'Reconnecting 1/5' },
      {
        type: 'item.completed',
        item: { type: 'agent_message', text: '{"count":7}' },
      },
      {
        type: 'turn.completed',
        usage: {
          input_tokens: 120,
          cached_input_tokens: 90,
          output_tokens: 12,
        },
      },
    ]
      .map((event) => JSON.stringify(event))
      .join('\n')

    expect(summarizeCodexEvents(events)).toEqual({
      inputTokens: 120,
      cachedInputTokens: 90,
      outputTokens: 12,
      toolCalls: 1,
      retries: 1,
      completed: true,
      answer: { count: 7 },
    })
  })

  it('keeps routing and reasoning overrides together before exec', () => {
    const args = buildCodexArguments('B', '/tmp/work', '/tmp/schema', 18790)
    const execIndex = args.indexOf('exec')
    expect(execIndex).toBeGreaterThan(0)
    expect(args.slice(0, execIndex)).toContain(
      'openai_base_url="http://127.0.0.1:18790/v1"',
    )
    expect(args.slice(0, execIndex)).toContain('model_reasoning_effort="xhigh"')
    expect(args.slice(execIndex + 1)).not.toContain('--config')
    expect(args).toContain('--ignore-user-config')
    expect(args).toContain('--ephemeral')
    expect(args).toContain('workspace-write')
    expect(args).toContain('--approve-for-me')
    expect(args.slice(0, execIndex)).toContain(
      'sandbox_workspace_write.exclude_tmpdir_env_var=true',
    )
    expect(args.slice(0, execIndex)).toContain(
      'sandbox_workspace_write.exclude_slash_tmp=true',
    )
  })

  it('registers context-mode only for D using a process override', () => {
    expect(
      buildCodexArguments('C', '/tmp/work', '/tmp/schema', 18790),
    ).not.toContain('mcp_servers.context-mode.command="/usr/bin/sandbox-exec"')
    expect(
      buildCodexArguments('D', '/tmp/work', '/tmp/schema', 18790),
    ).toContain('mcp_servers.context-mode.command="/usr/bin/sandbox-exec"')
  })

  it('denies outbound network for the local context-mode process', () => {
    const args = buildCodexArguments('D', '/tmp/work', '/tmp/schema', 18790)
    expect(args).toContain(
      'mcp_servers.context-mode.command="/usr/bin/sandbox-exec"',
    )
    expect(args.some((arg) => arg.includes('(deny network*)'))).toBe(true)
  })

  it('rejects a matching count when exact ids are missing', () => {
    const score = scoreAnswer(
      { jsonCount: 2, jsonIds: ['record-00001'] },
      { jsonCount: 2, jsonIds: ['record-00001', 'record-00002'] },
    )
    expect(score.countCorrect).toBe(true)
    expect(score.idsCorrect).toBe(false)
    expect(score.allCorrect).toBe(false)
    expect(score.checksPassed).toBe(1)
  })

  it('does not claim completion for a failed turn or malformed answer', () => {
    const events = [
      {
        type: 'item.completed',
        item: { type: 'agent_message', text: 'unfinished' },
      },
      { type: 'turn.failed', error: { message: 'request failed' } },
    ]
      .map((event) => JSON.stringify(event))
      .join('\n')
    expect(summarizeCodexEvents(events)).toMatchObject({
      completed: false,
      answer: null,
      inputTokens: 0,
    })
  })

  it('uses a direct MCP server and denies writes outside private scopes', () => {
    const args = buildCodexArguments('D', '/tmp/work', '/tmp/schema', 18790)
    const encoded = args.find((arg) =>
      arg.startsWith('mcp_servers.context-mode.args='),
    )
    const child = JSON.parse(encoded?.split('=').slice(1).join('=') ?? '[]')
    expect(child).toContain('/usr/bin/env')
    expect(child).toContain('-i')
    expect(child).toContain('build/server.js')
    expect(child).not.toContain('context-mode')
    expect(
      child.some((arg: string) => arg.includes('(deny file-write*)')),
    ).toBe(true)
    expect(
      child.some((arg: string) => arg.startsWith('CONTEXT_MODE_DATA_DIR=')),
    ).toBe(true)
    expect(
      child.some((arg: string) => arg.startsWith('CLAUDE_CONFIG_DIR=')),
    ).toBe(true)
    expect(
      child.some(
        (arg: string) =>
          arg.startsWith('HOME=') || arg.startsWith('CODEX_HOME='),
      ),
    ).toBe(false)
  })

  it('binds fixture tests to the selected Node even with an old PATH', () => {
    const command = fixtureTestCommand(
      '/selected runtime/node',
      '/fixture/vitest.mjs',
    )
    expect(command).toMatch(
      /^'\/selected runtime\/node' '\/fixture\/vitest[.]mjs'/u,
    )
    expect(command).not.toMatch(/^vitest/u)
  })

  it('reads the pinned proxy counter from summary rather than the root', () => {
    expect(
      readProxyCounters({
        summary: { api_requests: 12 },
        requests: { total: 12, failed: 0 },
      }),
    ).toEqual({ apiRequests: 12, requestsTotal: 12, requestsFailed: 0 })
  })

  it('keeps the existing direct routing policy with a local context-mode MCP', () => {
    const args = buildCodexArguments('A', '/tmp/work', '/tmp/schema', 18790)
    expect(args).toContain(
      'mcp_servers.context-mode.command="/usr/bin/sandbox-exec"',
    )
    expect(args).not.toContain('openai_base_url="http://127.0.0.1:18790/v1"')
  })
})

describe.runIf(process.platform !== 'win32')(
  'benchmark private output boundary',
  () => {
    const temporaryRoots: string[] = []
    const temporaryRoot = () => {
      const root = mkdtempSync(path.join(tmpdir(), 'codex-benchmark-test-'))
      temporaryRoots.push(root)
      return root
    }
    afterEach(() => {
      temporaryRoots
        .splice(0)
        .forEach((root) => rmSync(root, { recursive: true, force: true }))
    })

    it('refuses existing nonempty output and preserves its contents', () => {
      const output = temporaryRoot()
      const existing = path.join(output, 'existing.txt')
      writeFileSync(existing, 'unrelated fixture')
      expect(() => createPrivateOutput(output)).toThrow(/new directory/)
      expect(readFileSync(existing, 'utf8')).toBe('unrelated fixture')
    })

    it('refuses shared and symlinked output directories', () => {
      const root = temporaryRoot()
      const shared = path.join(root, 'shared')
      mkdirSync(shared)
      chmodSync(shared, 0o777)
      expect(() => createPrivateOutput(shared)).toThrow(/new directory/)
      const linked = path.join(root, 'linked')
      symlinkSync(shared, linked)
      expect(() => createPrivateOutput(linked)).toThrow(/new directory/)
    })

    it('creates new owner-only directories and files', () => {
      const output = createPrivateOutput(path.join(temporaryRoot(), 'new'))
      const file = path.join(output, 'metrics.json')
      writePrivate(file, '{}')
      expect(lstatSync(output).mode & 0o777).toBe(0o700)
      expect(lstatSync(file).mode & 0o777).toBe(0o600)
      expect(lstatSync(output).uid).toBe(process.getuid?.())
    })

    it('refuses an existing shared raw file instead of overwriting it', () => {
      const output = temporaryRoot()
      const shared = path.join(output, 'events.jsonl')
      writeFileSync(shared, 'unrelated fixture')
      chmodSync(shared, 0o644)
      expect(() => writePrivate(shared, 'benchmark raw data')).toThrow(
        /owner-only/,
      )
      expect(readFileSync(shared, 'utf8')).toBe('unrelated fixture')
    })

    it('uses the canonical output path in the prepare CLI', () => {
      const root = temporaryRoot()
      const output = path.join(root, 'canonical')
      const result = spawnSync(
        'bun',
        [
          path.resolve(import.meta.dirname, 'benchmark-codex-context.ts'),
          '--output',
          output,
        ],
        { encoding: 'utf8' },
      )
      expect(result.status).toBe(0)
      expect(result.stdout).toContain(JSON.stringify(realpathSync(output)))
    })

    it('refuses an old selected Node before starting a benchmark', () => {
      const root = temporaryRoot()
      const binary = path.join(root, 'old-node')
      writeFileSync(binary, '#!/bin/sh\necho v22.14.0\n', { mode: 0o700 })
      expect(() => selectBenchmarkNode('24', binary)).toThrow(/Node 24/u)
    })

    it.each(['CODEX_API_KEY', 'OPENAI_API_KEY'])(
      'refuses inherited %s rather than silently changing authentication',
      (key) => {
        const root = temporaryRoot()
        const parent = {
          [key]: 'DUMMY_AUTH_OVERRIDE',
          CODEX_HOME: '/existing/home',
        }
        expect(() => benchmarkEnvironment(root, parent)).toThrow(/API key/u)
        expect(parent[key]).toBe('DUMMY_AUTH_OVERRIDE')
      },
    )

    it('preserves the existing home while dropping empty API-key variables', () => {
      const root = temporaryRoot()
      const env = benchmarkEnvironment(root, {
        CODEX_HOME: '/existing/home',
        CODEX_API_KEY: ' ',
        OPENAI_API_KEY: '',
      })
      expect(env.CODEX_HOME).toBe('/existing/home')
      expect(env).not.toHaveProperty('CODEX_API_KEY')
      expect(env).not.toHaveProperty('OPENAI_API_KEY')
    })

    it('handles a missing proxy binary without leaking its path or stack', async () => {
      const root = temporaryRoot()
      const binaryDirectory = path.join(root, 'bin')
      mkdirSync(binaryDirectory)
      writeFileSync(
        path.join(binaryDirectory, 'codex'),
        '#!/bin/sh\nprintf "fixture-codex\\n"\n',
        { mode: 0o700 },
      )
      const reservation = createServer()
      await new Promise<void>((resolve) =>
        reservation.listen(0, '127.0.0.1', resolve),
      )
      const address = reservation.address()
      if (!address || typeof address === 'string') {
        throw new Error('Expected fixture port')
      }
      await new Promise<void>((resolve, reject) =>
        reservation.close((error) => (error ? reject(error) : resolve())),
      )
      const missingBinary = path.join(root, 'private-missing-proxy')
      const output = path.join(root, 'output')
      const result = spawnSync(
        'bun',
        [
          path.resolve(import.meta.dirname, 'benchmark-codex-context.ts'),
          '--run',
          '--variants',
          'B',
          '--repetitions',
          '1',
          '--headroom',
          missingBinary,
          '--port',
          String(address.port),
          '--output',
          output,
        ],
        {
          encoding: 'utf8',
          timeout: 10000,
          env: {
            ...process.env,
            PATH: `${binaryDirectory}${path.delimiter}${process.env.PATH ?? ''}`,
            CODEX_API_KEY: '',
            OPENAI_API_KEY: '',
          },
        },
      )
      expect(result.error).toBeUndefined()
      expect(result.status).toBe(1)
      expect(result.stderr).toContain(
        'Benchmark failed; private diagnostics retained',
      )
      expect(result.stderr).not.toContain(missingBinary)
      expect(result.stderr).not.toContain('ENOENT')
      expect(existsSync(path.join(output, 'proxy.log'))).toBe(true)
    })
  },
)
