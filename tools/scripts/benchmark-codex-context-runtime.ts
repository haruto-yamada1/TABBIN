import { spawnSync } from 'node:child_process'
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  readdirSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export type ContextModeRuntime = {
  server: string
  node: string
  toolPath: string
  root: string
  osScratchRoot?: string
  existingScratch?: string[]
}

export function contextModeOverrides(
  workspace: string,
  contextMode?: ContextModeRuntime,
): string[] {
  const contextRoot =
    contextMode?.root ?? path.join(workspace, '.benchmark-context-mode')
  const scratchRoot = contextMode?.osScratchRoot
  const scratchRule = scratchRoot
    ? ` (regex ${JSON.stringify(`^${scratchRoot}/[.]ctx-mode-${'[A-Za-z0-9]'.repeat(6)}(/.*)?$`)})`
    : ''
  const existingRules = (contextMode?.existingScratch ?? [])
    .map(
      (directory) =>
        `(deny file-write* (subpath ${JSON.stringify(directory)}))`,
    )
    .join('')
  const profile = `(version 1)(allow default)(deny network*)(deny file-write*)(allow file-write* (subpath ${JSON.stringify(workspace)}) (subpath ${JSON.stringify(contextRoot)})${scratchRule})${existingRules}`
  const childArgs = [
    '-p',
    profile,
    '/usr/bin/env',
    '-i',
    `PATH=${contextMode?.toolPath ?? '/usr/bin:/bin'}`,
    `TMPDIR=${path.join(contextRoot, 'tmp')}`,
    `CONTEXT_MODE_PROJECT_DIR=${workspace}`,
    `CONTEXT_MODE_DATA_DIR=${path.join(contextRoot, 'data')}`,
    `CLAUDE_CONFIG_DIR=${path.join(contextRoot, 'config')}`,
    'CONTEXT_MODE_PLATFORM=codex',
    contextMode?.node ?? 'node',
    contextMode?.server ?? 'build/server.js',
  ]
  return [
    'mcp_servers.context-mode.command="/usr/bin/sandbox-exec"',
    `mcp_servers.context-mode.args=${JSON.stringify(childArgs)}`,
  ]
}

function assertPrivatePath(file: string, kind: 'directory' | 'file'): void {
  const stat = lstatSync(file)
  const uid = process.getuid?.()
  const expectedMode = kind === 'directory' ? 0o700 : 0o600
  const typeMatches = kind === 'directory' ? stat.isDirectory() : stat.isFile()
  if (
    uid === undefined ||
    stat.uid !== uid ||
    stat.isSymbolicLink() ||
    !typeMatches ||
    (stat.mode & 0o7777) !== expectedMode
  ) {
    throw new Error(
      'Benchmark path must be owner-only, owned and non-symlinked',
    )
  }
}

export function privateDirectory(directory: string): void {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  assertPrivatePath(directory, 'directory')
}

export function writePrivate(file: string, content: string): void {
  privateDirectory(path.dirname(file))
  if (existsSync(file)) {
    assertPrivatePath(file, 'file')
  }
  const flags =
    constants.O_WRONLY |
    constants.O_CREAT |
    constants.O_TRUNC |
    constants.O_NOFOLLOW
  const fd = openSync(file, flags, 0o600)
  try {
    const stat = fstatSync(fd)
    if (stat.uid !== process.getuid?.() || (stat.mode & 0o7777) !== 0o600) {
      throw new Error('Benchmark file permissions are not private')
    }
    writeFileSync(fd, content)
  } finally {
    closeSync(fd)
  }
}

export function privateRawFile(file: string): number {
  assertPrivatePath(path.dirname(file), 'directory')
  const fd = openSync(file, 'wx', 0o600)
  const stat = fstatSync(fd)
  if (stat.uid !== process.getuid?.() || (stat.mode & 0o7777) !== 0o600) {
    closeSync(fd)
    throw new Error('Raw benchmark output must be private')
  }
  return fd
}

export function createPrivateOutput(output: string): string {
  const parent = realpathSync(path.dirname(output))
  const realOutput = path.join(parent, path.basename(output))
  if (
    ![tmpdir(), '/tmp'].some((directory) =>
      realOutput.startsWith(`${realpathSync(directory)}${path.sep}`),
    )
  ) {
    throw new Error('Benchmark raw output must stay in a temporary directory')
  }
  if (existsSync(output)) {
    throw new Error(
      'Benchmark output must be a new directory; existing output is preserved',
    )
  }
  mkdirSync(output, { mode: 0o700 })
  assertPrivatePath(output, 'directory')
  return realOutput
}

function installedProgram(command: string): string {
  const result = spawnSync('which', [command], { encoding: 'utf8' })
  if (result.status !== 0 || !result.stdout.trim()) {
    throw new Error('Required installed local tool unavailable')
  }
  return result.stdout.trim()
}

export function selectBenchmarkNode(
  repositoryVersion: string,
  binary = installedProgram('node'),
): string {
  const expectedMajor = Number(repositoryVersion.trim().split('.')[0])
  const version = spawnSync(binary, ['--version'], { encoding: 'utf8' })
  if (
    expectedMajor !== 24 ||
    version.status !== 0 ||
    !/^v24[.]/u.test(version.stdout.trim())
  ) {
    throw new Error('Benchmark requires the repository Node 24 runtime')
  }
  const resolved = spawnSync(binary, ['-p', 'process.execPath'], {
    encoding: 'utf8',
  })
  const executable = resolved.stdout.trim().split('\n').at(-1) ?? ''
  if (resolved.status !== 0 || !path.isAbsolute(executable)) {
    throw new Error('Selected Node 24 executable unavailable')
  }
  return executable
}

export function contextModeRuntime(
  options: { contextModeServer: string | undefined },
  runOutput: string,
): ContextModeRuntime {
  const binary = installedProgram('context-mode')
  const realBinary = realpathSync(binary)
  const managedRoot = path.resolve(path.dirname(binary), '..')
  const candidates = [
    options.contextModeServer,
    `${path.dirname(realBinary)}/build/server.js`,
    `${path.dirname(path.dirname(realBinary))}/build/server.js`,
    `${managedRoot}/lib/node_modules/context-mode/build/server.js`,
    `${managedRoot}/packages/context-mode/lib/node_modules/context-mode/build/server.js`,
  ]
  const server = candidates.find(
    (candidate) => candidate !== undefined && existsSync(candidate),
  )
  if (!server) {
    throw new Error(
      'Direct MCP-only context-mode server unavailable; provide --context-mode-server',
    )
  }
  const root = path.join(runOutput, 'context-mode')
  for (const directory of ['data', 'config', 'tmp']) {
    privateDirectory(path.join(root, directory))
  }
  const tools = ['node', 'bun', 'rtk'].map(installedProgram)
  const tempResult = spawnSync('/usr/bin/getconf', ['DARWIN_USER_TEMP_DIR'], {
    encoding: 'utf8',
  })
  if (tempResult.status !== 0) {
    throw new Error('Canonical executor OS scratch unavailable')
  }
  const osScratchAlias = path.resolve(tempResult.stdout.trim())
  const osScratchRoot = realpathSync(osScratchAlias)
  assertPrivatePath(osScratchRoot, 'directory')
  const existingScratch = readdirSync(osScratchRoot)
    .filter((name) => /^\.ctx-mode-[A-Za-z0-9]{6}$/u.test(name))
    .map((name) => path.join(osScratchRoot, name))
  return {
    server,
    osScratchRoot,
    existingScratch,
    node: tools[0] ?? 'node',
    toolPath: [
      ...tools.map((tool) => path.dirname(tool)),
      '/usr/bin',
      '/bin',
    ].join(path.delimiter),
    root,
  }
}
