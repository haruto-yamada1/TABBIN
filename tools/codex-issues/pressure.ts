import { spawnSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import type { Server, Socket } from 'node:net'
import path from 'node:path'

import {
  buildArguments,
  buildSandboxArguments,
  runProcess,
  sanitizedEnvironment,
} from './runtime'

const pressureNames = [
  'allowed_file_write',
  'scratch_write',
  'source_read',
  'other_file_write',
  'test_write',
  'config_write',
  'git_write',
  'git_read',
  'user_config_write',
  'user_config_read',
  'gold_read',
  'hidden_tests_read',
  'auth_read',
  'root_repository_read',
  'network',
] as const
type PressurePhase = 'candidate' | 'grader'

export function verifyPressureOutcomes(
  value: unknown,
  phase: PressurePhase,
): Record<string, string> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== pressureNames.length
  ) {
    throw new Error('Sandbox boundary proof is incomplete or malformed')
  }
  const allowed = new Set<string>(['scratch_write', 'source_read'])
  if (phase === 'candidate') {
    allowed.add('allowed_file_write')
  }
  const entries = pressureNames.map((name) => {
    const observed: unknown = Reflect.get(value, name)
    const valid = allowed.has(name)
      ? observed === 'ALLOWED'
      : observed === 'EPERM' || observed === 'EACCES'
    if (!valid || typeof observed !== 'string') {
      throw new Error(`Sandbox boundary proof failed (${phase}, ${name})`)
    }
    return [name, observed] as const
  })
  return Object.fromEntries(entries)
}

function nodeRuntime(): string {
  const options = {
    encoding: 'utf8' as const,
    env: sanitizedEnvironment(),
    timeout: 5000,
    maxBuffer: 4096,
  }
  const selected = spawnSync('node', ['-p', 'process.execPath'], options)
  if (selected.status !== 0) {
    throw new Error('Sandbox pressure requires an installed Node 24 runtime')
  }
  const binary = selected.stdout.trim()
  if (!path.isAbsolute(binary)) {
    throw new Error('Sandbox pressure requires an installed Node 24 runtime')
  }
  const version = spawnSync(binary, ['--version'], options)
  if (version.status !== 0 || !/^v24[.]/u.test(version.stdout.trim())) {
    throw new Error('Sandbox pressure requires Node 24 on PATH')
  }
  return realpathSync(binary)
}

function privateDirectory(directory: string): void {
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  const stat = lstatSync(directory)
  if (
    !stat.isDirectory() ||
    stat.isSymbolicLink() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o777) !== 0o700
  ) {
    throw new Error('Sandbox pressure directories must be owner-only')
  }
}

function syntheticFile(file: string): void {
  privateDirectory(path.dirname(file))
  writeFileSync(file, 'synthetic-pressure-fixture', { mode: 0o600, flag: 'wx' })
}

function syntheticWorkspace(directory: string): void {
  for (const file of [
    'src/allowed.ts',
    'src/other.ts',
    'tests/oracle.test.ts',
    'vitest.config.ts',
    '.git/config',
    '.codex/config.toml',
  ]) {
    syntheticFile(path.join(directory, file))
  }
  privateDirectory(path.join(directory, '.agent-tmp'))
}

type PressureCheck = { name: string; action: 'read' | 'write'; file: string }

function pressureChecks(
  workspace: string,
  privateRoot: string,
  otherWorkspace: string,
): PressureCheck[] {
  const local = [
    ['allowed_file_write', 'write', 'src/allowed.ts'],
    ['scratch_write', 'write', '.agent-tmp/scratch'],
    ['source_read', 'read', 'src/allowed.ts'],
    ['other_file_write', 'write', 'src/other.ts'],
    ['test_write', 'write', 'tests/oracle.test.ts'],
    ['config_write', 'write', 'vitest.config.ts'],
    ['git_write', 'write', '.git/config'],
    ['git_read', 'read', '.git/config'],
    ['user_config_write', 'write', '.codex/config.toml'],
    ['user_config_read', 'read', '.codex/config.toml'],
  ] as const
  return [
    ...local.map(([name, action, file]) => ({
      name,
      action,
      file: path.join(workspace, file),
    })),
    {
      name: 'gold_read',
      action: 'read',
      file: path.join(privateRoot, 'gold/source.ts'),
    },
    {
      name: 'hidden_tests_read',
      action: 'read',
      file: path.join(otherWorkspace, 'tests/oracle.test.ts'),
    },
    {
      name: 'auth_read',
      action: 'read',
      file: path.join(privateRoot, 'auth/auth.json'),
    },
    {
      name: 'root_repository_read',
      action: 'read',
      file: path.join(privateRoot, 'host-repo/.git/config'),
    },
  ]
}

function probeCode(checks: PressureCheck[], port: number): string {
  // The subprocess reads only synthetic fixtures and emits errno labels, never contents.
  return `
    const fs = require('node:fs');
    const net = require('node:net');
    const outcomes = Object.create(null);
    for (const check of ${JSON.stringify(checks)}) {
      try {
        if (check.action === 'write') fs.writeFileSync(check.file, 'pressure-probe');
        else fs.readFileSync(check.file);
        outcomes[check.name] = 'ALLOWED';
      } catch (error) {
        outcomes[check.name] = typeof error.code === 'string' ? error.code : 'UNKNOWN';
      }
    }
    let emitted = false;
    const socket = net.createConnection({host:'127.0.0.1',port:${port}});
    const timer = setTimeout(() => finish('TIMEOUT'), 1500);
    function finish(status) {
      if (emitted) return;
      emitted = true;
      clearTimeout(timer);
      socket.destroy();
      outcomes.network = status;
      process.stdout.write(JSON.stringify(outcomes));
    }
    socket.once('connect', () => finish('ALLOWED'));
    socket.once('error', error => finish(typeof error.code === 'string' ? error.code : 'UNKNOWN'));
  `
}

async function probePhase(
  phase: PressurePhase,
  workspace: string,
  privateRoot: string,
  otherWorkspace: string,
  binary: string,
  port: number,
): Promise<Record<string, string>> {
  const readRoots = [binary]
  if (existsSync('/System/Library/OpenSSL/openssl.cnf')) {
    readRoots.push('/System/Library/OpenSSL/openssl.cnf')
  }
  const invocation = buildArguments({
    workspace,
    allowedPaths: ['src/allowed.ts'],
    model: 'gpt-6.1-sol',
    effort: 'low',
    readRoots,
    denyReadPaths: [privateRoot],
  })
  const candidateArgs = invocation
    .slice(0, invocation.indexOf('exec'))
    .filter((argument) => argument !== '--strict-config')
  const args =
    phase === 'candidate'
      ? [...candidateArgs, 'sandbox', '-P', 'issue_eval', '-C', workspace, '--']
      : buildSandboxArguments(workspace, readRoots, [privateRoot])
  const result = await runProcess(
    'codex',
    [
      ...args,
      binary,
      '-e',
      probeCode(pressureChecks(workspace, privateRoot, otherWorkspace), port),
    ],
    {
      cwd: workspace,
      env: {
        ...sanitizedEnvironment(),
        TMPDIR: path.join(workspace, '.agent-tmp'),
      },
      timeoutMs: 5000,
      maxOutputBytes: 16 * 1024,
    },
  )
  if (result.exitCode !== 0 || result.timedOut || result.outputLimit) {
    throw new Error(
      `Sandbox pressure could not execute (${phase}); check host Seatbelt capability and Codex version`,
    )
  }
  let value: unknown
  try {
    value = JSON.parse(result.stdout)
  } catch {
    throw new Error(`Sandbox boundary proof is malformed (${phase})`)
  }
  return verifyPressureOutcomes(value, phase)
}

async function listen(server: Server): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', () => {
      reject(new Error('Sandbox pressure requires host loopback capability'))
    })
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') {
    throw new Error('Sandbox pressure loopback endpoint is unavailable')
  }
  return address.port
}

export async function proveSandbox(
  root: string,
): Promise<Record<string, string>> {
  if (process.platform !== 'darwin') {
    throw new Error(
      'Sandbox pressure requires macOS Seatbelt; other platforms fail closed',
    )
  }
  const binary = nodeRuntime()
  if (!path.isAbsolute(root) || !lstatSync(root).isDirectory()) {
    throw new Error(
      'Sandbox pressure root must be an existing absolute directory',
    )
  }
  const privateRoot = mkdtempSync(
    path.join(realpathSync(root), '.sandbox-pressure-'),
  )
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.once('close', () => sockets.delete(socket))
    socket.end('synthetic-network-endpoint')
  })
  try {
    privateDirectory(privateRoot)
    const candidate = path.join(privateRoot, 'candidate')
    const grader = path.join(privateRoot, 'grader')
    syntheticWorkspace(candidate)
    syntheticWorkspace(grader)
    for (const file of [
      'gold/source.ts',
      'auth/auth.json',
      'host-repo/.git/config',
    ]) {
      syntheticFile(path.join(privateRoot, file))
    }
    const port = await listen(server)
    const candidateOutcomes = await probePhase(
      'candidate',
      candidate,
      privateRoot,
      grader,
      binary,
      port,
    )
    const graderOutcomes = await probePhase(
      'grader',
      grader,
      privateRoot,
      candidate,
      binary,
      port,
    )
    return Object.fromEntries([
      ...Object.entries(candidateOutcomes).map(
        ([name, status]) => [`candidate.${name}`, status] as const,
      ),
      ...Object.entries(graderOutcomes).map(
        ([name, status]) => [`grader.${name}`, status] as const,
      ),
    ])
  } finally {
    for (const socket of sockets) {
      socket.destroy()
    }
    if (server.listening) {
      await new Promise<void>((resolve) =>
        server.close(() => {
          resolve()
        }),
      )
    }
    rmSync(privateRoot, { recursive: true, force: true })
  }
}
