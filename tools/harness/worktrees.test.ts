import { spawn, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { WorktreeRecord } from './worktrees-io'

const cli = path.resolve('tools/scripts/harness.ts')
const roots: string[] = []
function git(root: string, ...args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr)
  }
  return result.stdout.trim()
}
function project(
  options: {
    failApmCheckOnce?: boolean
    failApmCheckAlways?: boolean
    slowApmCheckIssue?: number
  } = {},
) {
  const root = realpathSync(
    mkdtempSync(path.join(tmpdir(), 'tabbin-worktrees-')),
  )
  roots.push(root)
  git(root, 'init', '-b', 'develop')
  git(root, 'config', 'user.email', 'fixture@example.invalid')
  git(root, 'config', 'user.name', 'Fixture')
  writeFileSync(
    path.join(root, '.gitignore'),
    '.worktrees/\nnode_modules/\n.agents/\n.codex/\n.output/\n.wxt/\n.fixture-tools/\n',
  )
  writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'fixture',
      private: true,
      dependencies: { 'fixture-dependency': 'file:./packages/v1' },
      scripts: {
        'apm:sync': 'bun setup.ts',
        'apm:check': 'bun setup.ts --check',
        'quality:check': 'bun inspect.ts',
      },
    }),
  )
  writeFileSync(
    path.join(root, 'setup.ts'),
    [
      "import {existsSync,mkdirSync,writeFileSync} from 'node:fs'",
      "mkdirSync('.agents/skills/fixture',{recursive:true})",
      "writeFileSync('.agents/skills/fixture/SKILL.md', process.cwd())",
      "if (process.argv.includes('--check')) {",
      `  if (process.cwd().endsWith('/issue-${String(options.slowApmCheckIssue ?? 0)}-fixture')) {`,
      "    writeFileSync('.agents/skills/fixture/apm-check-waiting', 'setup in progress')",
      '    await new Promise(resolve => setTimeout(resolve, 2000))',
      '  }',
      "  writeFileSync('.agents/skills/fixture/apm-check-attempts', String(Number(existsSync('.agents/skills/fixture/apm-check-attempts') ? await Bun.file('.agents/skills/fixture/apm-check-attempts').text() : 0) + 1))",
      `  if (process.cwd().endsWith('/issue-941-fixture') && (${String(options.failApmCheckAlways ?? false)} || (${String(options.failApmCheckOnce ?? false)} && !existsSync('.agents/skills/fixture/apm-check-failed')))) {`,
      "    writeFileSync('.agents/skills/fixture/apm-check-failed', 'retained setup failure')",
      '    process.exit(23)',
      '  }',
      '}',
      '',
    ].join('\n'),
  )
  writeFileSync(
    path.join(root, 'inspect.ts'),
    [
      "import {writeFileSync} from 'node:fs'",
      'console.log(JSON.stringify({cwd:process.cwd(),home:process.env.CODEX_HOME,hook:process.env.CLAUDE_PROJECT_DIR,context:process.env.CONTEXT_MODE_DATA_DIR,headroom:process.env.HEADROOM_WORKSPACE_DIR}))',
      "if (process.argv.includes('--wait')) {",
      "  writeFileSync('.agents/harness/exec-started', String(process.pid))",
      '  setInterval(() => {}, 1000)',
      '} else {',
      "  const exitIndex = process.argv.indexOf('--exit-code')",
      '  process.exit(exitIndex >= 0 ? Number(process.argv[exitIndex + 1]) : 0)',
      '}',
      '',
    ].join('\n'),
  )
  for (const version of [1, 2, 3]) {
    const directory = path.join(root, 'packages', `v${version}`)
    mkdirSync(directory, { recursive: true })
    writeFileSync(
      path.join(directory, 'package.json'),
      JSON.stringify({
        name: 'fixture-dependency',
        version: `${version}.0.0`,
        exports: './index.js',
      }),
    )
    writeFileSync(
      path.join(directory, 'index.js'),
      `export const marker = 'v${version}'\n`,
    )
  }
  const install = spawnSync('bun', ['install'], {
    cwd: root,
    encoding: 'utf8',
  })
  if (install.status !== 0) {
    throw new Error(install.stderr)
  }
  git(root, 'add', '.')
  git(root, 'commit', '-m', 'fixture')
  git(root, 'update-ref', 'refs/remotes/origin/develop', 'HEAD')
  git(root, 'remote', 'add', 'origin', 'https://github.com/fixture/repo.git')
  return root
}
function childEnvironment() {
  return {
    ...process.env,
    CODEX_HOME: '/private/durable-codex',
    CLAUDE_PROJECT_DIR: '/wrong/checkout',
  }
}
function run(root: string, ...args: string[]) {
  return runWithEnvironment(root, {}, ...args)
}
function runWithEnvironment(
  root: string,
  overrides: NodeJS.ProcessEnv,
  ...args: string[]
) {
  return spawnSync('bun', ['run', cli, 'worktree', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...childEnvironment(), ...overrides },
  })
}
type FixtureInvocation = {
  argv: string[]
  cwd: string
  home: string
  lossless?: string
  headroomMode?: string
}
function fixtureTools(
  root: string,
  options: { unsafeContextLauncher?: boolean; wrongProxyPid?: boolean } = {},
) {
  const tools = path.join(root, '.fixture-tools')
  const bin = path.join(tools, 'bin')
  const home = path.join(tools, 'codex-home')
  const contextServer = path.join(tools, 'context-mode/build/server.js')
  for (const directory of [bin, home, path.dirname(contextServer)]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
  }
  writeFileSync(contextServer, 'export {}\n')
  writeFileSync(path.join(home, 'config.toml'), 'model = "fixture-model"\n', {
    mode: 0o600,
  })
  writeFileSync(path.join(home, 'hooks.json'), '{"fixture":"retained"}\n', {
    mode: 0o600,
  })
  const rows = [
    {
      name: 'context-mode',
      enabled: true,
      transport: {
        type: 'stdio',
        command: options.unsafeContextLauncher ? 'context-mode' : 'node',
        args: options.unsafeContextLauncher ? [] : [contextServer],
        env: {},
        cwd: null,
      },
    },
    {
      name: 'serena',
      enabled: true,
      transport: {
        type: 'stdio',
        command: path.join(bin, 'serena'),
        args: ['start-mcp-server', '--project', '/wrong'],
        env: {},
        cwd: null,
      },
    },
  ]
  writeFileSync(
    path.join(bin, 'codex'),
    [
      '#!/usr/bin/env bun',
      'const args = process.argv.slice(2)',
      "if (args[0] === 'mcp' && args[1] === 'list' && args.includes('--json')) {",
      `  console.log(${JSON.stringify(JSON.stringify(rows))})`,
      '} else {',
      '  console.log(JSON.stringify({argv:args,cwd:process.cwd(),home:process.env.CODEX_HOME}))',
      '}',
      '',
    ].join('\n'),
  )
  writeFileSync(
    path.join(bin, 'serena'),
    [
      '#!/usr/bin/env bun',
      "if (process.argv.includes('--help')) console.log('--project PATH  --context TEXT  --mode TEXT')",
      'else console.log(JSON.stringify({argv:process.argv.slice(2)}))',
      '',
    ].join('\n'),
  )
  writeFileSync(
    path.join(bin, 'headroom'),
    [
      '#!/usr/bin/env bun',
      "import {createServer} from 'node:http'",
      "import {writeFileSync} from 'node:fs'",
      "import path from 'node:path'",
      'const args = process.argv.slice(2)',
      "if (args[0] === 'proxy') {",
      "  const port = Number(args[args.indexOf('--port') + 1])",
      "  const host = args[args.indexOf('--host') + 1]",
      '  const state = process.env.HEADROOM_WORKSPACE_DIR',
      '  const server = createServer((request, response) => {',
      "    writeFileSync(path.join(state, 'fixture-health-path'), request.url || '')",
      "    response.setHeader('content-type', 'application/json')",
      `    response.end(JSON.stringify({service:'headroom-proxy',ready:true,config:{pid:process.pid + ${options.wrongProxyPid ? '1000000' : '0'},mode:'cache'}}))`,
      '  })',
      "  server.listen(port, host, () => writeFileSync(path.join(state, 'fixture-proxy.pid'), String(process.pid)))",
      "  process.on('SIGTERM', () => server.close(() => process.exit(0)))",
      '} else {',
      '  console.log(JSON.stringify({argv:args,cwd:process.cwd(),home:process.env.CODEX_HOME,lossless:process.env.HEADROOM_LOSSLESS,headroomMode:process.env.HEADROOM_MODE}))',
      '}',
      '',
    ].join('\n'),
  )
  for (const binary of ['codex', 'serena', 'headroom']) {
    chmodSync(path.join(bin, binary), 0o700)
  }
  return {
    PATH: `${bin}${path.delimiter}${process.env.PATH ?? ''}`,
    CODEX_HOME: home,
  }
}
function fixtureInvocation(stdout: string): FixtureInvocation {
  const line = stdout.split('\n').find((value) => value.startsWith('{"argv":'))
  if (!line) {
    throw new Error('fixture invocation was not emitted')
  }
  return JSON.parse(line) as FixtureInvocation
}
function registryRecord(root: string, issue = 941): WorktreeRecord {
  return JSON.parse(
    readFileSync(
      path.join(root, `.git/tabbin-worktrees/issue-${issue}.json`),
      'utf8',
    ),
  ) as WorktreeRecord
}
type GeneratorState = {
  verification: { command: string; notes: string; status: string }[]
}
function generatorState(worktree: string, runId = 'issue-941'): GeneratorState {
  return JSON.parse(
    readFileSync(
      path.join(worktree, '.agents/harness/runs', runId, 'generator.json'),
      'utf8',
    ),
  ) as GeneratorState
}
function asynchronousRun(root: string, ...args: string[]) {
  const child = spawn('bun', ['run', cli, 'worktree', ...args], {
    cwd: root,
    env: childEnvironment(),
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => {
    output += chunk.toString()
  })
  child.stderr.on('data', (chunk: Buffer) => {
    output += chunk.toString()
  })
  const completed = new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', resolve)
  })
  return { child, completed, output: () => output }
}
async function waitForExec(worktree: string): Promise<void> {
  return waitForFile(path.join(worktree, '.agents/harness/exec-started'))
}
async function waitForFile(
  file: string,
  deadline = Date.now() + 5000,
): Promise<void> {
  if (existsSync(file)) {
    return
  }
  if (Date.now() > deadline) {
    throw new Error('fixture operation did not start')
  }
  return new Promise<void>((resolve) => setTimeout(resolve, 10)).then(
    async () => waitForFile(file, deadline),
  )
}
function start(root: string, issue: number) {
  const result = run(
    root,
    'start',
    '--issue',
    String(issue),
    '--slug',
    'fixture',
  )
  expect(result.stderr + result.stdout).not.toContain('worktree: error')
  expect(result.status).toBe(0)
  return path.join(root, '.worktrees', `issue-${issue}-fixture`)
}
function largeIgnoredWorktree() {
  const root = project()
  const work = start(root, 941)
  const generated = path.join(
    work,
    'node_modules/generated-fixture',
    'a'.repeat(180),
    'b'.repeat(180),
    'c'.repeat(180),
  )
  mkdirSync(generated, { recursive: true })
  for (let index = 0; index < 6000; index += 1) {
    writeFileSync(
      path.join(
        generated,
        `${String(index).padStart(5, '0')}-${'x'.repeat(180)}.js`,
      ),
      '',
    )
  }
  const listing = spawnSync(
    'git',
    ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'],
    { cwd: work, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  )
  expect(listing.status).toBe(0)
  expect(Buffer.byteLength(listing.stdout)).toBeGreaterThan(4 * 1024 * 1024)
  return { root, work }
}
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true })),
)

describe('Harness worktree lifecycle', () => {
  it('previews without changing the develop checkout or Git metadata', () => {
    const root = project()
    const before = git(root, 'status', '--porcelain')
    const result = run(
      root,
      'start',
      '--issue',
      '941',
      '--slug',
      'fixture',
      '--dry-run',
    )
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('codex/issue-941-fixture')
    expect(existsSync(path.join(root, '.worktrees'))).toBe(false)
    expect(existsSync(path.join(root, '.git/tabbin-worktrees'))).toBe(false)
    expect(git(root, 'status', '--porcelain')).toBe(before)
  })

  it('isolates two simultaneous edits, dependency locks, APM, runtime and Harness; resumes dirty work', async () => {
    const root = project()
    const rootLock = readFileSync(path.join(root, 'bun.lock'), 'utf8')
    const rootPackage = readFileSync(path.join(root, 'package.json'), 'utf8')
    const first = start(root, 941)
    const second = start(root, 942)
    const editAndInstall = async (cwd: string, version: number) => {
      const packageFile = path.join(cwd, 'package.json')
      const manifest = JSON.parse(readFileSync(packageFile, 'utf8')) as {
        dependencies: Record<string, string>
      }
      manifest.dependencies['fixture-dependency'] =
        `file:./packages/v${version}`
      writeFileSync(packageFile, `${JSON.stringify(manifest, null, 2)}\n`)
      writeFileSync(path.join(cwd, 'change.txt'), `v${version}`)
      mkdirSync(path.join(cwd, '.output'), { recursive: true })
      writeFileSync(path.join(cwd, '.output/artifact'), `v${version}`)
      return new Promise<void>((resolve, reject) => {
        const child = spawn('bun', ['install'], { cwd, stdio: 'pipe' })
        let diagnostics = ''
        child.stdout.on('data', (chunk: Buffer) => {
          diagnostics += chunk.toString()
        })
        child.stderr.on('data', (chunk: Buffer) => {
          diagnostics += chunk.toString()
        })
        child.on('error', reject)
        child.on('close', (code) => {
          if (code === 0) {
            resolve()
          } else {
            reject(new Error(`install exit ${String(code)}: ${diagnostics}`))
          }
        })
      })
    }
    await Promise.all([editAndInstall(first, 2), editAndInstall(second, 3)])
    const firstLock = readFileSync(path.join(first, 'bun.lock'), 'utf8')
    const secondLock = readFileSync(path.join(second, 'bun.lock'), 'utf8')
    expect(firstLock).toContain('packages/v2')
    expect(firstLock).not.toContain('packages/v3')
    expect(secondLock).toContain('packages/v3')
    expect(secondLock).not.toContain('packages/v2')
    expect(firstLock).not.toBe(secondLock)
    expect(readFileSync(path.join(root, 'bun.lock'), 'utf8')).toBe(rootLock)
    expect(readFileSync(path.join(root, 'package.json'), 'utf8')).toBe(
      rootPackage,
    )
    for (const [checkout, version] of [
      [root, 1],
      [first, 2],
      [second, 3],
    ] as const) {
      expect(
        readFileSync(
          path.join(checkout, 'node_modules/fixture-dependency/index.js'),
          'utf8',
        ),
      ).toBe(`export const marker = 'v${version}'\n`)
    }
    expect(
      readFileSync(path.join(first, '.agents/skills/fixture/SKILL.md'), 'utf8'),
    ).toBe(first)
    expect(
      readFileSync(
        path.join(second, '.agents/skills/fixture/SKILL.md'),
        'utf8',
      ),
    ).toBe(second)
    expect(run(root, 'pause', '--issue', '941').status).toBe(0)
    expect(run(root, 'resume', '--issue', '941').status).toBe(0)
    expect(readFileSync(path.join(first, 'change.txt'), 'utf8')).toBe('v2')
    expect(run(first, 'status').stdout).toContain('942')
    const executed = run(root, 'exec', '--issue', '941', '--tool', 'quality')
    expect(executed.status).toBe(0)
    expect(executed.stdout).toContain(`"hook":"${first}"`)
    expect(executed.stdout).toContain('"home":"/private/durable-codex"')
    expect(executed.stdout).toContain(
      `${first}/.agents/harness/runtime/context-mode`,
    )
    expect(
      readFileSync(path.join(first, '.agents/harness/ACTIVE'), 'utf8'),
    ).toBe('issue-941\n')
    expect(git(root, 'status', '--porcelain')).toBe('')
  })

  it('enforces the active limit, duplicate issue and safe input checks', () => {
    const root = project()
    start(root, 941)
    start(root, 942)
    expect(
      run(root, 'start', '--issue', '943', '--slug', 'fixture').status,
    ).not.toBe(0)
    expect(
      run(root, 'start', '--issue', '941', '--slug', 'other').status,
    ).not.toBe(0)
    expect(
      run(root, 'start', '--issue', '944', '--slug', '../escape').status,
    ).not.toBe(0)
    expect(run(root, 'pause', '--issue', '941').status).toBe(0)
    start(root, 943)
    expect(run(root, 'resume', '--issue', '941').status).not.toBe(0)
  })

  it('cleans known ignored files beyond the default output buffer and keeps the branch', () => {
    const { root, work } = largeIgnoredWorktree()
    const result = run(root, 'cleanup', '--issue', '941', '--confirm', '941')
    expect(result.status).toBe(0)
    expect(existsSync(work)).toBe(false)
    expect(
      git(root, 'show-ref', '--verify', 'refs/heads/codex/issue-941-fixture'),
    ).toContain('codex/issue-941-fixture')
    expect(git(root, 'status', '--porcelain')).toBe('')
  })

  it('retains a private ignored file after a listing beyond the default output buffer', () => {
    const { root, work } = largeIgnoredWorktree()
    writeFileSync(
      path.join(work, '.gitignore'),
      `${readFileSync(path.join(work, '.gitignore'), 'utf8')}zz-private.recovery.json\n`,
    )
    git(work, 'add', '.gitignore')
    git(work, 'commit', '-m', 'ignore private fixture after generated paths')
    writeFileSync(
      path.join(work, 'zz-private.recovery.json'),
      'retained-private-marker',
    )
    const result = run(root, 'cleanup', '--issue', '941', '--confirm', '941')
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('unknown ignored files retained')
    expect(
      readFileSync(path.join(work, 'zz-private.recovery.json'), 'utf8'),
    ).toBe('retained-private-marker')
    expect(result.stdout + result.stderr).not.toContain(
      'retained-private-marker',
    )
    expect(git(root, 'status', '--porcelain')).toBe('')
  })

  it('refuses dirty or unknown ignored cleanup and never removes branches', () => {
    const root = project()
    const work = start(root, 941)
    writeFileSync(path.join(work, 'uncommitted.txt'), 'keep')
    expect(
      run(root, 'cleanup', '--issue', '941', '--confirm', '941').status,
    ).not.toBe(0)
    expect(existsSync(work)).toBe(true)
    rmSync(path.join(work, 'uncommitted.txt'))
    writeFileSync(
      path.join(work, '.gitignore'),
      `${readFileSync(path.join(work, '.gitignore'), 'utf8')}.env\n`,
    )
    git(work, 'add', '.gitignore')
    git(work, 'commit', '-m', 'ignore private fixture')
    writeFileSync(path.join(work, '.env'), 'dummy-private-marker')
    const blocked = run(root, 'cleanup', '--issue', '941', '--confirm', '941')
    expect(blocked.status).not.toBe(0)
    expect(blocked.stdout + blocked.stderr).not.toContain(
      'dummy-private-marker',
    )
    rmSync(path.join(work, '.env'))
    expect(run(root, 'cleanup', '--issue', '941').status).not.toBe(0)
    expect(
      run(root, 'cleanup', '--issue', '941', '--confirm', '941').status,
    ).toBe(0)
    expect(existsSync(work)).toBe(false)
    expect(
      git(root, 'show-ref', '--verify', 'refs/heads/codex/issue-941-fixture'),
    ).toContain('codex/issue-941-fixture')
    expect(run(root, 'status').stdout).toContain('removed')
  })

  it('fails closed for shared symlinks, Git lock contention and mismatched branch', () => {
    const root = project()
    mkdirSync(path.join(root, '.git/tabbin-worktrees.lock'))
    const contention = run(root, 'start', '--issue', '941', '--slug', 'fixture')
    expect(contention.status).not.toBe(0)
    expect(contention.stderr).toContain('worktree lifecycle lock exists')
    rmSync(path.join(root, '.git/tabbin-worktrees.lock'), { recursive: true })
    const work = start(root, 941)
    rmSync(path.join(work, 'node_modules'), { recursive: true })
    symlinkSync(root, path.join(work, 'node_modules'), 'dir')
    expect(
      run(root, 'exec', '--issue', '941', '--tool', 'quality').status,
    ).not.toBe(0)
    rmSync(path.join(work, 'node_modules'))
    git(work, 'switch', '-c', 'unexpected')
    expect(run(root, 'resume', '--issue', '941').status).not.toBe(0)
  })

  it('reports Git directory permission failures without suggesting stale lock cleanup', () => {
    const root = project()
    const common = path.join(root, '.git')
    chmodSync(common, 0o500)
    try {
      const denied = run(root, 'start', '--issue', '941', '--slug', 'fixture')
      expect(denied.status).not.toBe(0)
      expect(denied.stderr).toMatch(/EACCES|EPERM/)
      expect(denied.stderr).not.toContain('worktree lifecycle lock exists')
      expect(existsSync(path.join(common, 'tabbin-worktrees.lock'))).toBe(false)
      expect(existsSync(path.join(root, '.worktrees/issue-941-fixture'))).toBe(
        false,
      )
    } finally {
      chmodSync(common, 0o755)
    }
  })

  it('retains failed APM setup and retries the same Issue Harness on resume', () => {
    const root = project({ failApmCheckOnce: true })
    const failed = run(root, 'start', '--issue', '941', '--slug', 'fixture')
    expect(failed.status).not.toBe(0)
    const before = registryRecord(root)
    expect(before.phase).toBe('failed')
    expect(existsSync(before.worktree)).toBe(true)
    expect(
      readFileSync(
        path.join(before.worktree, 'node_modules/fixture-dependency/index.js'),
        'utf8',
      ),
    ).toBe("export const marker = 'v1'\n")
    expect(
      readFileSync(
        path.join(before.worktree, '.agents/skills/fixture/apm-check-attempts'),
        'utf8',
      ),
    ).toBe('1')
    writeFileSync(
      path.join(before.worktree, 'retained.txt'),
      'keep through retry',
    )

    const resumed = run(root, 'resume', '--issue', '941')
    expect(resumed.status).toBe(0)
    const after = registryRecord(root)
    expect(after.phase).toBe('ready')
    expect(after.runId).toBe(before.runId)
    expect(after.worktree).toBe(before.worktree)
    expect(after.branch).toBe(before.branch)
    expect(after.slot).toBe(before.slot)
    expect(
      readFileSync(path.join(after.worktree, '.agents/harness/ACTIVE'), 'utf8'),
    ).toBe(`${before.runId}\n`)
    expect(
      readFileSync(
        path.join(after.worktree, '.agents/skills/fixture/apm-check-attempts'),
        'utf8',
      ),
    ).toBe('2')
    expect(
      readFileSync(path.join(after.worktree, 'retained.txt'), 'utf8'),
    ).toBe('keep through retry')
    expect(
      generatorState(after.worktree).verification.map((entry) => entry.command),
    ).toEqual(['harness:worktree setup', 'harness:worktree resume'])
    expect(git(root, 'status', '--porcelain')).toBe('')
  })

  it('records only a PR from origin and preserves the task on invalid URLs', () => {
    const root = project()
    const work = start(root, 941)
    const recordFile = path.join(root, '.git/tabbin-worktrees/issue-941.json')
    const before = readFileSync(recordFile, 'utf8')
    const beforeChecks = generatorState(work).verification
    for (const invalid of [
      'https://github.com/another/repo/pull/10',
      'https://github.com/fixture/another/pull/10',
      'http://github.com/fixture/repo/pull/10',
      'https://github.com/fixture/repo/pull/0',
      'https://github.com/fixture/repo/pull/10?secret=dummy',
    ]) {
      expect(
        run(root, 'finish', '--issue', '941', '--pr', invalid).status,
      ).not.toBe(0)
      expect(readFileSync(recordFile, 'utf8')).toBe(before)
      expect(generatorState(work).verification).toEqual(beforeChecks)
    }
    git(root, 'remote', 'set-url', 'origin', 'git@github.com:fixture/repo.git')
    const pr = 'https://github.com/fixture/repo/pull/10'
    expect(run(root, 'finish', '--issue', '941', '--pr', pr).status).toBe(0)
    expect(registryRecord(root)).toMatchObject({ phase: 'finished', pr })
    expect(existsSync(work)).toBe(true)
    expect(git(root, 'status', '--porcelain')).toBe('')
  })

  it.each([
    { tool: 'dev', port: 13700 },
    { tool: 'headroom', port: 18780 },
  ])('refuses to reuse the occupied $tool port', async ({ tool, port }) => {
    const root = project()
    start(root, 941)
    const server = createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', resolve)
    })
    try {
      const result = run(root, 'exec', '--issue', '941', '--tool', tool)
      expect(result.status).not.toBe(0)
      expect(result.stdout + result.stderr).toContain('port is occupied')
      expect(server.listening).toBe(true)
      expect(registryRecord(root)).toMatchObject({ phase: 'ready' })
      expect(registryRecord(root).ownerPid).toBeUndefined()
      expect(registryRecord(root).childPid).toBeUndefined()
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    }
  })

  it('returns the tool exit code and records its final checkpoint', () => {
    const root = project()
    const work = start(root, 941)
    const before = generatorState(work).verification.length
    const result = run(
      root,
      'exec',
      '--issue',
      '941',
      '--tool',
      'quality',
      '--',
      '--exit-code',
      '7',
    )
    expect(result.status).toBe(7)
    const verification = generatorState(work).verification
    expect(verification).toHaveLength(before + 2)
    expect(verification.at(-1)).toMatchObject({
      command: 'harness:worktree exec quality exit 7',
      notes: 'Tool finished: exit=7; interrupted=false',
      status: 'failed',
    })
    expect(registryRecord(root).phase).toBe('ready')
    expect(registryRecord(root).ownerPid).toBeUndefined()
    expect(registryRecord(root).childPid).toBeUndefined()
  })

  it('rejects lifecycle changes for a live exec and resumes a preserved interrupted task', async () => {
    const root = project()
    const work = start(root, 941)
    writeFileSync(path.join(work, 'interrupted.txt'), 'keep interrupted edit')
    const active = asynchronousRun(
      root,
      'exec',
      '--issue',
      '941',
      '--tool',
      'quality',
      '--',
      '--wait',
    )
    let fixturePid: number | undefined
    try {
      await waitForExec(work)
      const startedPid = Number(
        readFileSync(path.join(work, '.agents/harness/exec-started'), 'utf8'),
      )
      fixturePid = startedPid
      const running = registryRecord(root)
      expect(running.phase).toBe('running')
      expect(running.ownerPid).toBe(active.child.pid)
      expect(running.childPid).toEqual(expect.any(Number))
      expect(() => process.kill(startedPid, 0)).not.toThrow()
      for (const args of [
        ['pause'],
        ['resume'],
        ['finish', '--pr', 'https://github.com/fixture/repo/pull/10'],
        ['cleanup', '--confirm', '941'],
        ['exec', '--tool', 'quality'],
      ]) {
        const [command, ...extra] = args
        expect(
          run(root, command ?? '', '--issue', '941', ...extra).status,
        ).not.toBe(0)
        expect(registryRecord(root).phase).toBe('running')
      }
      expect(active.child.kill('SIGINT')).toBe(true)
      let timeout: ReturnType<typeof setTimeout> | undefined
      let exit: number | null
      try {
        exit = await Promise.race([
          active.completed,
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(
              () =>
                reject(
                  new Error(`interrupt did not finish: ${active.output()}`),
                ),
              5000,
            )
          }),
        ])
      } finally {
        clearTimeout(timeout)
      }
      expect(exit).not.toBe(0)
      expect(registryRecord(root).phase).toBe('paused')
      expect(registryRecord(root).ownerPid).toBeUndefined()
      expect(registryRecord(root).childPid).toBeUndefined()
      expect(generatorState(work).verification.at(-1)?.notes).toContain(
        'interrupted=true',
      )
      expect(run(root, 'resume', '--issue', '941').status).toBe(0)
      expect(registryRecord(root)).toMatchObject({
        phase: 'ready',
        runId: running.runId,
      })
      expect(readFileSync(path.join(work, 'interrupted.txt'), 'utf8')).toBe(
        'keep interrupted edit',
      )
      expect(
        run(root, 'exec', '--issue', '941', '--tool', 'quality').status,
      ).toBe(0)
    } finally {
      if (fixturePid !== undefined) {
        try {
          process.kill(fixturePid, 'SIGTERM')
        } catch {
          // The owned fixture may already have exited on SIGINT.
        }
      }
      active.child.kill('SIGTERM')
      await active.completed
    }
  })

  it.each(['active', 'run', 'generator'] as const)(
    'refuses shared Harness %s paths without changing the other Issue',
    (kind) => {
      const root = project()
      const first = start(root, 941)
      const second = start(root, 942)
      const firstRun = path.join(first, '.agents/harness/runs/issue-941')
      const secondRun = path.join(second, '.agents/harness/runs/issue-942')
      const sourcePaths = {
        active: path.join(first, '.agents/harness/ACTIVE'),
        run: firstRun,
        generator: path.join(firstRun, 'generator.json'),
      }
      const targetPaths = {
        active: path.join(second, '.agents/harness/ACTIVE'),
        run: secondRun,
        generator: path.join(secondRun, 'generator.json'),
      }
      const source = sourcePaths[kind]
      const target = targetPaths[kind]
      const before = readFileSync(
        path.join(secondRun, 'generator.json'),
        'utf8',
      )
      rmSync(source, { recursive: true })
      symlinkSync(target, source, kind === 'run' ? 'dir' : 'file')
      const result = run(root, 'pause', '--issue', '941')
      expect(result.status).not.toBe(0)
      expect(readFileSync(path.join(secondRun, 'generator.json'), 'utf8')).toBe(
        before,
      )
      expect(registryRecord(root).phase).toBe('ready')
    },
  )

  it('refuses dangling Harness ACTIVE links during failed setup resume', () => {
    const root = project({ failApmCheckOnce: true })
    expect(
      run(root, 'start', '--issue', '941', '--slug', 'fixture').status,
    ).not.toBe(0)
    const record = registryRecord(root)
    const active = path.join(record.worktree, '.agents/harness/ACTIVE')
    const outside = path.join(root, 'outside-active')
    rmSync(active)
    symlinkSync(outside, active, 'file')
    const before = readFileSync(
      path.join(root, '.git/tabbin-worktrees/issue-941.json'),
      'utf8',
    )
    const result = run(root, 'resume', '--issue', '941')
    expect(result.status).not.toBe(0)
    expect(existsSync(outside)).toBe(false)
    expect(
      readFileSync(
        path.join(root, '.git/tabbin-worktrees/issue-941.json'),
        'utf8',
      ),
    ).toBe(before)
  })

  it('refuses generated APM surfaces linked to shared client settings', () => {
    const root = project({ failApmCheckOnce: true })
    expect(
      run(root, 'start', '--issue', '941', '--slug', 'fixture').status,
    ).not.toBe(0)
    const record = registryRecord(root)
    const shared = path.join(root, '.fixture-tools/shared-client')
    mkdirSync(shared, { recursive: true, mode: 0o700 })
    const hooks = path.join(shared, 'hooks.json')
    writeFileSync(hooks, '{"fixture":"retained"}\n')
    symlinkSync(shared, path.join(record.worktree, '.codex'), 'dir')
    const result = run(root, 'resume', '--issue', '941')
    expect(result.status).not.toBe(0)
    expect(readFileSync(hooks, 'utf8')).toBe('{"fixture":"retained"}\n')
    expect(registryRecord(root).phase).toBe('failed')
  })

  it.each(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'apm.lock.yaml'])(
    'refuses tracked generated output %s linked to another checkout',
    (file) => {
      const root = project({ failApmCheckOnce: true })
      expect(
        run(root, 'start', '--issue', '941', '--slug', 'fixture').status,
      ).not.toBe(0)
      const record = registryRecord(root)
      const shared = path.join(root, '.fixture-tools/shared-output')
      mkdirSync(shared, { recursive: true, mode: 0o700 })
      const target = path.join(shared, file)
      writeFileSync(target, 'retained tracked output\n')
      const source = path.join(record.worktree, file)
      if (existsSync(source)) {
        rmSync(source)
      }
      symlinkSync(target, source, 'file')
      const result = run(root, 'resume', '--issue', '941')
      expect(result.status).not.toBe(0)
      expect(readFileSync(target, 'utf8')).toBe('retained tracked output\n')
      expect(registryRecord(root).phase).toBe('failed')
    },
  )

  it('refuses tampered registry paths without mutating either checkout', () => {
    const root = project()
    const work = start(root, 941)
    const recordFile = path.join(root, '.git/tabbin-worktrees/issue-941.json')
    const current = registryRecord(root)
    const generator = readFileSync(
      path.join(work, '.agents/harness/runs/issue-941/generator.json'),
      'utf8',
    )
    writeFileSync(
      path.join(root, 'primary-retained.txt'),
      'dummy-private-marker',
    )
    const primaryStatus = git(root, 'status', '--porcelain')
    writeFileSync(recordFile, JSON.stringify({ ...current, worktree: root }))
    const tampered = readFileSync(recordFile, 'utf8')
    for (const args of [
      ['pause'],
      ['resume'],
      ['cleanup', '--confirm', '941'],
      ['exec', '--tool', 'quality'],
    ]) {
      const [command, ...extra] = args
      const rejected = run(root, command ?? '', '--issue', '941', ...extra)
      expect(rejected.status).not.toBe(0)
      expect(rejected.stdout + rejected.stderr).not.toContain(
        'dummy-private-marker',
      )
      expect(readFileSync(recordFile, 'utf8')).toBe(tampered)
      expect(git(root, 'status', '--porcelain')).toBe(primaryStatus)
      expect(
        readFileSync(
          path.join(work, '.agents/harness/runs/issue-941/generator.json'),
          'utf8',
        ),
      ).toBe(generator)
      expect(existsSync(work)).toBe(true)
    }
  })

  it.each(['.codex/auth.json', '.agents/private.json'])(
    'retains unknown ignored private data at %s',
    (file) => {
      const root = project()
      const work = start(root, 941)
      const privateFile = path.join(work, file)
      mkdirSync(path.dirname(privateFile), { recursive: true })
      writeFileSync(privateFile, 'dummy-private-marker')
      const result = run(root, 'cleanup', '--issue', '941', '--confirm', '941')
      expect(result.status).not.toBe(0)
      expect(result.stdout + result.stderr).not.toContain(
        'dummy-private-marker',
      )
      expect(readFileSync(privateFile, 'utf8')).toBe('dummy-private-marker')
      expect(existsSync(work)).toBe(true)
      expect(registryRecord(root).phase).toBe('ready')
    },
  )

  it('pauses failed setup to free capacity and retries it on the same Harness after resume', () => {
    const root = project({ failApmCheckOnce: true })
    expect(
      run(root, 'start', '--issue', '941', '--slug', 'fixture').status,
    ).not.toBe(0)
    const failed = registryRecord(root)
    const active = readFileSync(
      path.join(failed.worktree, '.agents/harness/ACTIVE'),
      'utf8',
    )
    writeFileSync(
      path.join(failed.worktree, 'retained-setup.txt'),
      'keep failed setup',
    )
    expect(run(root, 'pause', '--issue', '941').status).toBe(0)
    const pausedChecks = generatorState(failed.worktree).verification
    expect(pausedChecks.at(-1)?.command).toBe('harness:worktree pause')
    start(root, 942)
    start(root, 943)
    expect(run(root, 'resume', '--issue', '941').status).not.toBe(0)
    expect(
      readFileSync(
        path.join(failed.worktree, '.agents/skills/fixture/apm-check-attempts'),
        'utf8',
      ),
    ).toBe('1')
    expect(run(root, 'pause', '--issue', '942').status).toBe(0)

    expect(run(root, 'resume', '--issue', '941').status).toBe(0)
    expect(registryRecord(root)).toMatchObject({
      phase: 'ready',
      runId: failed.runId,
      worktree: failed.worktree,
      slot: failed.slot,
    })
    expect(
      readFileSync(
        path.join(failed.worktree, '.agents/harness/ACTIVE'),
        'utf8',
      ),
    ).toBe(active)
    expect(
      readFileSync(
        path.join(failed.worktree, '.agents/skills/fixture/apm-check-attempts'),
        'utf8',
      ),
    ).toBe('2')
    expect(
      readFileSync(path.join(failed.worktree, 'retained-setup.txt'), 'utf8'),
    ).toBe('keep failed setup')
    expect(generatorState(failed.worktree).verification).toEqual([
      ...pausedChecks,
      expect.objectContaining({ command: 'harness:worktree setup' }),
      expect.objectContaining({ command: 'harness:worktree resume' }),
    ])
  })

  it('archives and removes a clean task whose setup cannot be repaired', () => {
    const root = project({ failApmCheckAlways: true })
    expect(
      run(root, 'start', '--issue', '941', '--slug', 'fixture').status,
    ).not.toBe(0)
    const failed = registryRecord(root)
    expect(run(root, 'resume', '--issue', '941').status).not.toBe(0)
    expect(registryRecord(root).phase).toBe('failed')
    expect(git(failed.worktree, 'status', '--porcelain')).toBe('')
    expect(
      run(root, 'cleanup', '--issue', '941', '--confirm', '941').status,
    ).toBe(0)
    expect(registryRecord(root).phase).toBe('removed')
    expect(existsSync(failed.worktree)).toBe(false)
    const registry = path.join(root, '.git/tabbin-worktrees')
    const archive = readdirSync(registry).find((name) =>
      name.startsWith('archive-941-'),
    )
    expect(archive).toBeDefined()
    expect(
      readFileSync(path.join(registry, archive ?? '', 'ACTIVE'), 'utf8'),
    ).toBe(`${failed.runId}\n`)
    expect(
      git(root, 'show-ref', '--verify', 'refs/heads/codex/issue-941-fixture'),
    ).toContain('codex/issue-941-fixture')
  })

  it('overrides Codex stdio MCP cwd and project per child while preserving durable home and shared config', () => {
    const root = project()
    const work = start(root, 941)
    const env = fixtureTools(root)
    const configFile = path.join(env.CODEX_HOME, 'config.toml')
    const hooksFile = path.join(env.CODEX_HOME, 'hooks.json')
    const config = readFileSync(configFile, 'utf8')
    const hooks = readFileSync(hooksFile, 'utf8')
    const result = runWithEnvironment(
      root,
      env,
      'exec',
      '--issue',
      '941',
      '--tool',
      'codex',
    )
    expect(result.stderr).not.toContain('worktree: error')
    expect(result.status).toBe(0)
    const invocation = fixtureInvocation(result.stdout)
    expect(invocation.cwd).toBe(work)
    expect(invocation.home).toBe(env.CODEX_HOME)
    const overrides = invocation.argv
      .flatMap((value, index) =>
        value === '-c' ? [invocation.argv[index + 1] ?? ''] : [],
      )
      .map((value) =>
        value.replace(/^mcp_servers\."([^"]+)"\./, 'mcp_servers.$1.'),
      )
    expect(
      overrides.some(
        (value) =>
          value.startsWith('mcp_servers.context-mode.cwd=') &&
          value.includes(work),
      ),
    ).toBe(true)
    expect(
      overrides.some(
        (value) =>
          value.includes('CONTEXT_MODE_PROJECT_DIR') && value.includes(work),
      ),
    ).toBe(true)
    expect(
      overrides.some(
        (value) =>
          value.includes('CONTEXT_MODE_DATA_DIR') &&
          value.includes(`${work}/.agents/harness/runtime/context-mode`),
      ),
    ).toBe(true)
    expect(
      overrides.some(
        (value) =>
          value.startsWith('mcp_servers.serena.cwd=') && value.includes(work),
      ),
    ).toBe(true)
    expect(
      overrides.some(
        (value) =>
          value.startsWith('mcp_servers.serena.args=') &&
          value.includes('--project') &&
          value.includes(work) &&
          !value.includes('/wrong'),
      ),
    ).toBe(true)
    expect(readFileSync(configFile, 'utf8')).toBe(config)
    expect(readFileSync(hooksFile, 'utf8')).toBe(hooks)
    expect(git(root, 'status', '--porcelain')).toBe('')
  })

  it('refuses a context-mode launcher that can mutate shared hooks', () => {
    const root = project()
    const work = start(root, 941)
    const env = fixtureTools(root, { unsafeContextLauncher: true })
    const configFile = path.join(env.CODEX_HOME, 'config.toml')
    const config = readFileSync(configFile, 'utf8')
    const result = runWithEnvironment(
      root,
      env,
      'exec',
      '--issue',
      '941',
      '--tool',
      'codex',
    )
    expect(result.status).not.toBe(0)
    expect(result.stdout).not.toContain('{"argv":')
    expect(readFileSync(configFile, 'utf8')).toBe(config)
    expect(registryRecord(root).phase).toBe('ready')
    expect(existsSync(work)).toBe(true)
  })

  it.each([
    ['-capproval_policy=never'],
    ['--approve-for-me'],
    ['--dangerously-bypass-hook-trust'],
    ['--add-dir=/tmp/another-workspace'],
    ['--remote=127.0.0.1:9999'],
    ['--worktree'],
    ['--profile', 'untrusted-profile'],
    ['-s', 'danger-full-access'],
    ['--sandbox', 'danger-full-access'],
    ['-a', 'never'],
    ['--sandbox=danger-full-access'],
    ['--profile=untrusted-profile'],
  ])(
    'rejects attached config, profile and approval overrides %j',
    (...extra) => {
      const root = project()
      start(root, 941)
      const recordFile = path.join(root, '.git/tabbin-worktrees/issue-941.json')
      const before = readFileSync(recordFile, 'utf8')
      const result = run(
        root,
        'exec',
        '--issue',
        '941',
        '--tool',
        'quality',
        '--',
        ...extra,
      )
      expect(result.status).not.toBe(0)
      expect(result.stdout).not.toContain('"cwd":')
      expect(readFileSync(recordFile, 'utf8')).toBe(before)
    },
  )

  it('starts and verifies its own Headroom proxy, forbids wrapper fallback and stops that proxy', async () => {
    const root = project()
    const work = start(root, 941)
    const env = fixtureTools(root)
    const proxyState = path.join(work, '.agents/harness/runtime/headroom')
    const pidFile = path.join(proxyState, 'fixture-proxy.pid')
    try {
      const result = runWithEnvironment(
        root,
        env,
        'exec',
        '--issue',
        '941',
        '--tool',
        'headroom',
      )
      expect(result.stderr).not.toContain('worktree: error')
      expect(result.status).toBe(0)
      const invocation = fixtureInvocation(result.stdout)
      expect(invocation.argv).toContain('--no-proxy')
      expect(invocation.argv).toContain('--no-mcp')
      expect(
        invocation.argv.slice(
          invocation.argv.indexOf('--port') + 1,
          invocation.argv.indexOf('--port') + 2,
        ),
      ).toEqual(['18780'])
      expect(invocation.cwd).toBe(work)
      expect(invocation.home).toBe(env.CODEX_HOME)
      expect(invocation.lossless).toBe('1')
      expect(invocation.headroomMode).toBe('cache')
      expect(
        readFileSync(path.join(proxyState, 'fixture-health-path'), 'utf8'),
      ).toBe('/health?include_config=true')
      const pid = Number(readFileSync(pidFile, 'utf8'))
      expect(() => process.kill(pid, 0)).toThrow(/ESRCH/)
      expect(registryRecord(root).proxyPid).toBeUndefined()
      const server = createServer()
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(18780, '127.0.0.1', resolve)
      })
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      )
    } finally {
      if (existsSync(pidFile)) {
        const pid = Number(readFileSync(pidFile, 'utf8'))
        try {
          process.kill(pid, 'SIGTERM')
        } catch {
          // This test owns the proxy fixture and it normally exits before return.
        }
      }
    }
  })

  it('finishes an exec while another Issue is still setting up', async () => {
    const root = project({ slowApmCheckIssue: 942 })
    const work = start(root, 941)
    const setupWork = path.join(root, '.worktrees/issue-942-fixture')
    const pending = asynchronousRun(
      root,
      'start',
      '--issue',
      '942',
      '--slug',
      'fixture',
    )
    try {
      await waitForFile(
        path.join(setupWork, '.agents/skills/fixture/apm-check-waiting'),
      )
      expect(pending.child.exitCode).toBeNull()
      const result = run(root, 'exec', '--issue', '941', '--tool', 'quality')
      expect(result.stderr).not.toContain('worktree: error')
      expect(result.status).toBe(0)
      expect(registryRecord(root).phase).toBe('ready')
      expect(generatorState(work).verification.at(-1)).toMatchObject({
        command: 'harness:worktree exec quality exit 0',
        status: 'passed',
      })
      expect(pending.child.exitCode).toBeNull()
      expect(await pending.completed).toBe(0)
      expect(registryRecord(root, 942).phase).toBe('ready')
    } finally {
      await pending.completed
    }
  })

  it('rejects a Headroom health PID mismatch and stops only its owned proxy', () => {
    const root = project()
    const work = start(root, 941)
    const env = fixtureTools(root, { wrongProxyPid: true })
    const pidFile = path.join(
      work,
      '.agents/harness/runtime/headroom/fixture-proxy.pid',
    )
    try {
      const result = runWithEnvironment(
        root,
        env,
        'exec',
        '--issue',
        '941',
        '--tool',
        'headroom',
      )
      expect(result.status).not.toBe(0)
      expect(result.stdout).not.toContain('{"argv":')
      const pid = Number(readFileSync(pidFile, 'utf8'))
      expect(() => process.kill(pid, 0)).toThrow(/ESRCH/)
      expect(registryRecord(root).proxyPid).toBeUndefined()
      expect(registryRecord(root).phase).toBe('ready')
    } finally {
      if (existsSync(pidFile)) {
        try {
          process.kill(Number(readFileSync(pidFile, 'utf8')), 'SIGTERM')
        } catch {
          // The fixture PID came from this test's dedicated proxy process.
        }
      }
    }
  })
})
