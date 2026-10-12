import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  buildArguments,
  buildSandboxArguments,
  runProcess,
  sanitizedEnvironment,
  summarizeEvents,
} from './runtime'

const directories: string[] = []

function workspace(): string {
  const directory = mkdtempSync(path.join(tmpdir(), 'issue-runtime-'))
  directories.push(directory)
  mkdirSync(path.join(directory, 'src'))
  writeFileSync(path.join(directory, 'src', 'allowed.ts'), '')
  return realpathSync(directory)
}

function config(arguments_: string[]): string[] {
  return arguments_.flatMap((argument, index) =>
    argument === '-c' ? [arguments_[index + 1] ?? ''] : [],
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('issue evaluation invocation', () => {
  it('grants exact production files and private scratch, with isolated tools and ChatGPT auth', () => {
    const directory = workspace()
    const args = buildArguments({
      workspace: directory,
      allowedPaths: ['src/allowed.ts'],
      model: 'gpt-6.1-sol',
      effort: 'medium',
      readRoots: [process.execPath],
    })
    const overrides = config(args)
    const permissions = overrides.find((value) =>
      value.startsWith('permissions.issue_eval.filesystem='),
    )
    expect(permissions).toContain('":minimal"="read"')
    expect(permissions).toContain(`${JSON.stringify(directory)}="read"`)
    expect(permissions).toContain(
      `${JSON.stringify(path.join(directory, 'src/allowed.ts'))}="write"`,
    )
    expect(permissions).toContain(
      `${JSON.stringify(path.join(directory, '.agent-tmp'))}="write"`,
    )
    expect(permissions).toContain(
      `${JSON.stringify(path.join(directory, '.git'))}="deny"`,
    )
    expect(permissions).toContain(
      `${JSON.stringify(path.join(directory, '.codex'))}="deny"`,
    )
    expect(permissions).not.toContain('":root"')
    expect(overrides).toContain('default_permissions="issue_eval"')
    expect(overrides).toContain('permissions.issue_eval.network.enabled=false')
    expect(overrides).toContain('forced_login_method="chatgpt"')
    expect(overrides).toContain('model_provider="openai"')
    expect(overrides).toContain('allow_login_shell=false')
    expect(overrides).toContain('shell_environment_policy.inherit="none"')
    expect(overrides).toContain('mcp_servers={}')
    expect(overrides).not.toContain('project_doc_max_bytes=0')
    expect(
      overrides.find((value) =>
        value.startsWith('shell_environment_policy.set='),
      ),
    ).not.toContain('"HOME"')
    expect(overrides).toContain('web_search="disabled"')
    for (const feature of [
      'hooks',
      'plugins',
      'apps',
      'browser_use',
      'computer_use',
      'multi_agent',
      'memories',
      'shell_snapshot',
    ]) {
      expect(overrides).toContain(`features.${feature}=false`)
    }
    expect(args).toContain('--strict-config')
    expect(args).toContain('--no-daemon')
    expect(args.slice(args.indexOf('exec'))).toEqual(
      expect.arrayContaining([
        '--ignore-user-config',
        '--ignore-rules',
        '--ephemeral',
        '--json',
        '--skip-git-repo-check',
        '-',
      ]),
    )
    expect(args.lastIndexOf('-c')).toBeLessThan(args.indexOf('exec'))
    expect(overrides.join('\n')).not.toMatch(
      /sandbox_mode|sandbox_workspace_write/u,
    )
  })

  it.each([
    '../outside.ts',
    '/absolute.ts',
    'src/*.ts',
    'src',
    '.git/config',
    '.codex/config.toml',
  ])('rejects an unsafe write allowance: %s', (allowed) => {
    const directory = workspace()
    expect(() =>
      buildArguments({
        workspace: directory,
        allowedPaths: [allowed],
        model: 'gpt-6.1-sol',
        effort: 'low',
        readRoots: [],
      }),
    ).toThrow(/allow|path|file/iu)
  })

  it('rejects symlink write targets and broad runtime read roots', () => {
    const directory = workspace()
    symlinkSync(
      path.join(directory, 'src/allowed.ts'),
      path.join(directory, 'src/link.ts'),
    )
    expect(() =>
      buildArguments({
        workspace: directory,
        allowedPaths: ['src/link.ts'],
        model: 'gpt-6.1-sol',
        effort: 'low',
        readRoots: [],
      }),
    ).toThrow(/symlink|path/iu)
    expect(() =>
      buildArguments({
        workspace: directory,
        allowedPaths: ['src/allowed.ts'],
        model: 'gpt-6.1-sol',
        effort: 'low',
        readRoots: ['/'],
      }),
    ).toThrow(/read|root/iu)
  })

  it('keeps grader tests, source and configuration immutable with only private scratch writes', () => {
    const directory = workspace()
    const args = buildSandboxArguments(directory, [process.execPath])
    expect(config(args)).toContain(
      'permissions.issue_eval.network.enabled=false',
    )
    expect(config(args)).toContain(
      `projects={${JSON.stringify(directory)}={trust_level="untrusted"}}`,
    )
    const permissions =
      config(args).find((value) =>
        value.startsWith('permissions.issue_eval.filesystem='),
      ) ?? ''
    expect(permissions).toContain(`${JSON.stringify(directory)}="read"`)
    const writablePaths = [
      ...permissions.matchAll(/"([^"\n]+)"="write"/gu),
    ].map((match) => match[1])
    expect(writablePaths).toEqual([path.join(directory, '.agent-tmp')])
    expect(args.slice(args.indexOf('sandbox'))).toEqual([
      'sandbox',
      '-P',
      'issue_eval',
      '-C',
      directory,
      '--',
    ])
  })

  it('denies temporary parents and explicit sealed paths while allowing only the workspace', () => {
    const directory = workspace()
    const denied = path.join(path.dirname(directory), 'sealed-grade')
    const args = buildArguments({
      workspace: directory,
      allowedPaths: ['src/allowed.ts'],
      model: 'gpt-6.1-sol',
      effort: 'low',
      readRoots: [],
      denyReadPaths: [denied],
    })
    const overrides = config(args)
    const permissions = overrides.find((value) =>
      value.startsWith('permissions.issue_eval.filesystem='),
    )
    expect(permissions).toContain(
      `${JSON.stringify(realpathSync(tmpdir()))}="deny"`,
    )
    expect(permissions).toContain(
      `${JSON.stringify(realpathSync('/tmp'))}="deny"`,
    )
    expect(permissions).toContain(`${JSON.stringify(denied)}="deny"`)
    expect(overrides).toContain(
      `projects={${JSON.stringify(directory)}={trust_level="untrusted"}}`,
    )
    const grader = config(buildSandboxArguments(directory, [], [denied]))
    expect(
      grader.find((value) =>
        value.startsWith('permissions.issue_eval.filesystem='),
      ),
    ).toContain(`${JSON.stringify(denied)}="deny"`)
  })

  it.each(['auth', 'home'])(
    'rejects a canonical private %s read root behind a symlink',
    (kind) => {
      const directory = workspace()
      const privateRoot = realpathSync(
        mkdtempSync(path.join(tmpdir(), 'private-runtime-test-')),
      )
      const alias = `${privateRoot}-alias`
      directories.push(privateRoot, alias)
      symlinkSync(privateRoot, alias, 'dir')
      if (kind === 'auth') {
        vi.stubEnv('CODEX_HOME', alias)
      } else {
        vi.stubEnv('HOME', alias)
        vi.stubEnv('CODEX_HOME', path.join(alias, '.codex'))
      }
      expect(() =>
        buildArguments({
          workspace: directory,
          allowedPaths: ['src/allowed.ts'],
          model: 'gpt-6.1-sol',
          effort: 'low',
          readRoots: [privateRoot],
        }),
      ).toThrow(/private|auth|read|root/)
    },
  )

  it('retains CLI auth location while stripping credential, proxy and code-injection environment', () => {
    vi.stubEnv('CODEX_HOME', '/private/auth-home')
    vi.stubEnv('OPENAI_API_KEY', 'do-not-return')
    vi.stubEnv('GH_TOKEN', 'do-not-return')
    vi.stubEnv('GITHUB_TOKEN', 'do-not-return')
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'do-not-return')
    vi.stubEnv('NODE_OPTIONS', '--require /unsafe.js')
    vi.stubEnv('HTTP_PROXY', 'http://unsafe.invalid')
    const env = sanitizedEnvironment()
    expect(env.HOME).toBe(process.env.HOME)
    expect(env.CODEX_HOME).toBe('/private/auth-home')
    expect(env.PATH).toBe(process.env.PATH)
    for (const key of [
      'OPENAI_API_KEY',
      'GH_TOKEN',
      'GITHUB_TOKEN',
      'AWS_SECRET_ACCESS_KEY',
      'NODE_OPTIONS',
      'HTTP_PROXY',
    ]) {
      expect(env).not.toHaveProperty(key)
    }
  })
})

describe('Codex event metrics', () => {
  it('sums complete usage and counts each tool once across lifecycle events', () => {
    const events = [
      { type: 'thread.started', thread_id: 't' },
      { type: 'item.started', item: { id: 'c1', type: 'command_execution' } },
      { type: 'item.completed', item: { id: 'c1', type: 'command_execution' } },
      { type: 'item.completed', item: { id: 'p1', type: 'file_change' } },
      {
        type: 'item.completed',
        item: { id: 'm1', type: 'agent_message', text: 'retry is a word' },
      },
      { type: 'error', message: 'Reconnecting... 1/5' },
      {
        type: 'turn.completed',
        usage: {
          input_tokens: 100,
          cached_input_tokens: 20,
          output_tokens: 12,
        },
      },
      {
        type: 'turn.completed',
        usage: {
          input_tokens: 200,
          cached_input_tokens: 50,
          output_tokens: 18,
        },
      },
    ]
      .map((event) => JSON.stringify(event))
      .join('\n')
    expect(summarizeEvents(events)).toEqual({
      completed: true,
      inputTokens: 300,
      cachedInputTokens: 70,
      outputTokens: 30,
      toolCalls: 2,
      retries: 1,
      invalidEvents: false,
    })
  })

  it('preserves unknown usage instead of inventing zeros for incomplete or missing metrics', () => {
    expect(summarizeEvents('')).toMatchObject({
      completed: false,
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
    })
    expect(
      summarizeEvents(
        JSON.stringify({
          type: 'turn.completed',
          usage: { input_tokens: 10, output_tokens: 2 },
        }),
      ),
    ).toMatchObject({
      completed: true,
      inputTokens: 10,
      cachedInputTokens: null,
      outputTokens: 2,
      invalidEvents: true,
    })
    expect(
      summarizeEvents(
        JSON.stringify({
          type: 'turn.completed',
          usage: {
            input_tokens: -1,
            cached_input_tokens: 0,
            output_tokens: 2.5,
          },
        }),
      ),
    ).toMatchObject({
      inputTokens: null,
      cachedInputTokens: 0,
      outputTokens: null,
      invalidEvents: true,
    })
  })

  it('rejects malformed streams and does not retain completion after a failed or unfinished turn', () => {
    expect(summarizeEvents('not json\nnull\n{}')).toMatchObject({
      completed: false,
      invalidEvents: true,
    })
    const complete = JSON.stringify({
      type: 'turn.completed',
      usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 2 },
    })
    expect(
      summarizeEvents(`${complete}\n{"type":"turn.failed"}`),
    ).toMatchObject({ completed: false })
    expect(
      summarizeEvents(`${complete}\n{"type":"turn.started"}`),
    ).toMatchObject({
      completed: false,
      inputTokens: null,
      outputTokens: null,
      cachedInputTokens: null,
    })
    expect(
      summarizeEvents(`${complete}\n{"type":"turn.completed","usage":{}}`),
    ).toMatchObject({
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      invalidEvents: true,
    })
  })
})

describe('bounded subprocess', () => {
  it('sends input and reports actual exit status and separate output', async () => {
    const result = await runProcess(
      process.execPath,
      [
        '-e',
        "let text='';process.stdin.on('data',value=>text+=value);process.stdin.on('end',()=>{process.stdout.write(text.toUpperCase());process.stderr.write('diagnostic');process.exitCode=7})",
      ],
      { cwd: workspace(), input: 'sample', timeoutMs: 5000 },
    )
    expect(result).toMatchObject({
      exitCode: 7,
      stdout: 'SAMPLE',
      stderr: 'diagnostic',
      timedOut: false,
      outputLimit: false,
    })
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0)
  })

  it('caps combined output and terminates the producer', async () => {
    const result = await runProcess(
      process.execPath,
      [
        '-e',
        "setInterval(()=>{process.stdout.write('x'.repeat(4096));process.stderr.write('y'.repeat(4096))},1)",
      ],
      { cwd: workspace(), timeoutMs: 5000, maxOutputBytes: 100 },
    )
    expect(
      Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr),
    ).toBeLessThanOrEqual(100)
    expect(result.outputLimit).toBe(true)
    expect(result.timedOut).toBe(false)
    expect(result.elapsedMs).toBeLessThan(3000)
  })

  it('keeps decoded invalid UTF-8 output within the byte limit', async () => {
    const result = await runProcess(
      process.execPath,
      [
        '-e',
        'process.stdout.write(Buffer.from([255,255,255]));setInterval(()=>{},1000)',
      ],
      { cwd: workspace(), timeoutMs: 5000, maxOutputBytes: 1 },
    )
    expect(result.outputLimit).toBe(true)
    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(1)
  })

  it('kills SIGTERM-resistant descendants with the timed-out process group', async () => {
    const directory = workspace()
    const marker = path.join(directory, 'escaped')
    const script = path.join(directory, 'signal-resistant.cjs')
    writeFileSync(
      script,
      `const { spawn } = require('node:child_process')
const { writeFileSync } = require('node:fs')
process.on('SIGTERM', () => {})
if (process.argv[2] === 'child') {
  setTimeout(() => writeFileSync(process.argv[3], 'escaped'), 750)
} else {
  spawn(process.execPath, [__filename, 'child', process.argv[2]], { stdio: 'ignore' })
}
setInterval(() => {}, 1000)
`,
    )
    const result = await runProcess(process.execPath, [script, marker], {
      cwd: directory,
      timeoutMs: 150,
    })
    expect(result.timedOut).toBe(true)
    expect(result.elapsedMs).toBeLessThan(3000)
    await delay(800)
    expect(existsSync(marker)).toBe(false)
  })

  it('rejects spawn failures and invalid resource limits', async () => {
    await expect(
      runProcess('/nonexistent/issue-eval-command', [], {
        cwd: workspace(),
        timeoutMs: 1000,
      }),
    ).rejects.toThrow(/start process/iu)
    await expect(
      runProcess(process.execPath, [], { cwd: workspace(), timeoutMs: 0 }),
    ).rejects.toThrow(/timeout/iu)
    await expect(
      runProcess(process.execPath, [], {
        cwd: workspace(),
        timeoutMs: 1000,
        maxOutputBytes: -1,
      }),
    ).rejects.toThrow(/output/iu)
  })
})
