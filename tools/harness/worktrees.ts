import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { setTimeout } from 'node:timers/promises'

import {
  GENERATED_AGENT_ARTIFACT_PATHS,
  TRACKED_SYNC_ARTIFACTS,
} from '#agent-config-sync'
import { z } from 'zod'

import {
  checkpointHarnessRun,
  initializeHarnessRun,
  validateHarnessRun,
} from './state'
import {
  worktreeRecordSchema as recordSchema,
  privateWorktreeDirectory,
} from './worktrees-io'
import type { WorktreeRecord } from './worktrees-io'
import {
  executeWorktreeTool,
  portAvailable,
  worktreePorts,
} from './worktrees-runtime'

const MAX_ACTIVE = 2
type Repository = { root: string; common: string; registry: string }

function git(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`git ${args[0] ?? 'command'} failed; inspect Git locally`)
  }
  return result.stdout.trim()
}

function repository(cwd: string): Repository {
  const common = realpathSync(
    git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
  )
  const first = git(cwd, ['worktree', 'list', '--porcelain']).split('\n')[0]
  if (!first?.startsWith('worktree ')) {
    throw new Error('primary checkout is missing')
  }
  const root = realpathSync(first.slice('worktree '.length))
  return { root, common, registry: path.join(common, 'tabbin-worktrees') }
}

function writeRecord(repo: Repository, record: WorktreeRecord): void {
  privateWorktreeDirectory(repo.registry)
  const target = path.join(repo.registry, `issue-${record.issue}.json`)
  const temp = `${target}.${randomUUID()}.tmp`
  writeFileSync(temp, `${JSON.stringify(record, null, 2)}\n`, {
    flag: 'wx',
    mode: 0o600,
  })
  renameSync(temp, target)
}

function records(repo: Repository): WorktreeRecord[] {
  if (!existsSync(repo.registry)) {
    return []
  }
  privateWorktreeDirectory(repo.registry)
  const all = readdirSync(repo.registry)
    .filter((file) => /^issue-\d+\.json$/.test(file))
    .map((file) => {
      const recordPath = path.join(repo.registry, file)
      const stat = lstatSync(recordPath)
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        stat.uid !== process.getuid?.() ||
        (stat.mode & 0o777) !== 0o600
      ) {
        throw new Error('invalid registry file')
      }
      const record = recordSchema.parse(
        JSON.parse(readFileSync(recordPath, 'utf8')),
      )
      const name = `issue-${record.issue}-${record.slug}`
      if (
        file !== `issue-${record.issue}.json` ||
        record.branch !== `codex/${name}` ||
        record.worktree !== path.join(repo.root, '.worktrees', name) ||
        record.runId !== `issue-${record.issue}`
      ) {
        throw new Error('registry identity does not match repository/worktree')
      }
      return record
    })
  const activeSlots = all
    .filter((r) => r.phase !== 'removed')
    .map((r) => r.slot)
  if (new Set(activeSlots).size !== activeSlots.length) {
    throw new Error('registry slot reservations overlap')
  }
  return all
}

class WorktreeLockError extends Error {
  override name = 'WorktreeLockError'
}

function locked<T>(repo: Repository, action: () => T): T {
  const lock = path.join(repo.common, 'tabbin-worktrees.lock')
  try {
    mkdirSync(lock, { mode: 0o700 })
  } catch {
    throw new WorktreeLockError(
      'worktree lifecycle lock exists; inspect owner/stale lock manually',
    )
  }
  try {
    writeFileSync(
      path.join(lock, 'owner.json'),
      JSON.stringify({ pid: process.pid }),
      { flag: 'wx', mode: 0o600 },
    )
    return action()
  } finally {
    rmSync(lock, { recursive: true })
  }
}

async function queuedLock<T>(
  repo: Repository,
  action: () => T,
  deadline = Date.now() + 30000,
): Promise<T> {
  try {
    return locked(repo, action)
  } catch (error) {
    if (error instanceof WorktreeLockError && Date.now() < deadline) {
      await setTimeout(50)
      return queuedLock(repo, action, deadline)
    }
    throw error
  }
}

function assertCapacity(all: WorktreeRecord[], current?: number): void {
  if (
    all.filter(
      (r) =>
        r.issue !== current && ['ready', 'running', 'failed'].includes(r.phase),
    ).length >= MAX_ACTIVE
  ) {
    throw new Error('parallel limit is 2; pause or finish an idle Issue first')
  }
}

function localPathStat(file: string) {
  try {
    return lstatSync(file)
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return undefined
    }
    throw error
  }
}

function generatedArtifactAncestors(): string[] {
  return [...GENERATED_AGENT_ARTIFACT_PATHS, ...TRACKED_SYNC_ARTIFACTS].flatMap(
    (file) => {
      const segments = file.split('/')
      return segments.map((_segment, index) =>
        segments.slice(0, index + 1).join('/'),
      )
    },
  )
}

export function assertWorktree(record: WorktreeRecord): void {
  if (
    !existsSync(record.worktree) ||
    lstatSync(record.worktree).isSymbolicLink() ||
    realpathSync(record.worktree) !== record.worktree
  ) {
    throw new Error('worktree is missing or redirected')
  }
  if (
    git(record.worktree, ['rev-parse', '--show-toplevel']) !==
      record.worktree ||
    git(record.worktree, ['branch', '--show-current']) !== record.branch
  ) {
    throw new Error('worktree/branch identity changed')
  }
  const primary = path.dirname(path.dirname(record.worktree))
  if (
    git(record.worktree, [
      'rev-parse',
      '--path-format=absolute',
      '--git-common-dir',
    ]) !==
    git(primary, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  ) {
    throw new Error('worktree belongs to another Git repository')
  }
  for (const name of new Set([
    'node_modules',
    '.agents',
    '.agents/harness',
    '.agents/harness/ACTIVE',
    '.agents/harness/runs',
    `.agents/harness/runs/${record.runId}`,
    '.agents/harness/runtime',
    '.wxt',
    '.output',
    'coverage',
    'test-results',
    'playwright-report',
    '.serena',
    'apm_modules',
    ...generatedArtifactAncestors(),
  ])) {
    const file = path.join(record.worktree, name)
    if (localPathStat(file)?.isSymbolicLink()) {
      throw new Error(`shared symlink rejected: ${name}`)
    }
  }
}

function alive(pid: number | undefined): boolean {
  if (pid === undefined) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ESRCH') {
      return false
    }
    return true
  }
}

function assertIdle(record: WorktreeRecord): void {
  if (
    alive(record.ownerPid) ||
    alive(record.childPid) ||
    alive(record.proxyPid)
  ) {
    throw new Error('Issue process is still alive; stop its own terminal first')
  }
}

function assertHarnessIdentity(record: WorktreeRecord): void {
  const active = path.join(record.worktree, '.agents/harness/ACTIVE')
  if (
    !existsSync(active) ||
    readFileSync(active, 'utf8').trim() !== record.runId
  ) {
    throw new Error('Harness ACTIVE identity changed')
  }
  const runDirectory = path.join(
    record.worktree,
    '.agents/harness/runs',
    record.runId,
  )
  for (const file of readdirSync(runDirectory)) {
    if (lstatSync(path.join(runDirectory, file)).isSymbolicLink()) {
      throw new Error('Harness checkpoint contains a shared symlink')
    }
  }
}

function checkpoint(record: WorktreeRecord, action: string): void {
  assertHarnessIdentity(record)
  const validation = validateHarnessRun({
    projectRoot: record.worktree,
    runId: record.runId,
  })
  if (!validation.ok) {
    throw new Error('worktree Harness is invalid; repair it before continuing')
  }
  checkpointHarnessRun({
    projectRoot: record.worktree,
    runId: record.runId,
    command: `harness:worktree ${action}`,
    notes: 'Issue lifecycle checkpoint; working files preserved',
    status: 'recorded',
  })
}

function setup(record: WorktreeRecord): void {
  assertWorktree(record)
  const active = path.join(record.worktree, '.agents/harness/ACTIVE')
  if (
    existsSync(active) &&
    readFileSync(active, 'utf8').trim() !== record.runId
  ) {
    throw new Error('another Harness run already owns this worktree')
  }
  if (!existsSync(active)) {
    initializeHarnessRun({
      projectRoot: record.worktree,
      runId: record.runId,
      task: `Issue #${record.issue}: ${record.slug}`,
    })
  }
  for (const args of [
    ['install', '--frozen-lockfile'],
    ['run', 'apm:sync'],
    ['run', 'apm:check'],
  ]) {
    const result = spawnSync('bun', args, {
      cwd: record.worktree,
      stdio: 'inherit',
      env: { ...process.env, CLAUDE_PROJECT_DIR: record.worktree },
    })
    if (result.status !== 0) {
      throw new Error('frozen install/APM setup failed; retained for resume')
    }
    assertWorktree(record)
  }
  checkpoint(record, 'setup')
}

function required(args: string[], name: string): string {
  const index = args.indexOf(name)
  const value = index < 0 ? undefined : args[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} is required`)
  }
  return value
}

function issueNumber(args: string[]): number {
  const value = required(args, '--issue')
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error('invalid Issue number')
  }
  return z.number().int().positive().parse(Number(value))
}

function newRecord(
  repo: Repository,
  all: WorktreeRecord[],
  args: string[],
): WorktreeRecord {
  const issue = issueNumber(args)
  const slug = recordSchema.shape.slug.parse(required(args, '--slug'))
  if (all.some((r) => r.issue === issue)) {
    throw new Error(
      'Issue is already registered; use resume or inspect its removed record',
    )
  }
  assertCapacity(all)
  const name = `issue-${issue}-${slug}`
  const registered = git(repo.root, ['worktree', 'list', '--porcelain'])
  if (
    registered
      .split('\n')
      .some((line) =>
        new RegExp(`^branch refs/heads/[^ ]*issue-${issue}(?:-|$)`).test(line),
      )
  ) {
    throw new Error(
      'an existing worktree owns this Issue; inspect it before adoption',
    )
  }
  const worktree = path.join(repo.root, '.worktrees', name)
  const parent = path.dirname(worktree)
  if (
    existsSync(parent) &&
    (lstatSync(parent).isSymbolicLink() || realpathSync(parent) !== parent)
  ) {
    throw new Error('worktree parent is redirected')
  }
  if (existsSync(worktree)) {
    throw new Error('worktree path already exists')
  }
  const ignored = spawnSync('git', ['check-ignore', '-q', '.worktrees/'], {
    cwd: repo.root,
  })
  if (ignored.status !== 0) {
    throw new Error('.worktrees must be Git ignored')
  }
  const slots = new Set(
    all.filter((r) => r.phase !== 'removed').map((r) => r.slot),
  )
  let slot = 0
  while (slots.has(slot)) {
    slot += 1
  }
  return recordSchema.parse({
    issue,
    slug,
    branch: `codex/${name}`,
    worktree,
    slot,
    runId: `issue-${issue}`,
    phase: 'failed',
    setupComplete: false,
  })
}

function cleanForRemoval(record: WorktreeRecord): void {
  if (
    git(record.worktree, ['status', '--porcelain', '--untracked-files=all'])
  ) {
    throw new Error('uncommitted/untracked files retained; cleanup refused')
  }
  const allowed = new Set([
    'node_modules',
    'apm_modules',
    '.wxt',
    '.output',
    'coverage',
    'test-results',
    'playwright-report',
    'blob-report',
    '.waza-cache',
    '.waza-results',
  ])
  const ignored = git(record.worktree, [
    'ls-files',
    '--others',
    '--ignored',
    '--exclude-standard',
    '-z',
  ])
  for (const file of ignored.split('\0').filter(Boolean)) {
    if (
      !allowed.has(file.split('/')[0] ?? '') &&
      !file.startsWith('.agents/harness/') &&
      !file.startsWith('.cache/ci-audit/') &&
      !GENERATED_AGENT_ARTIFACT_PATHS.some(
        (prefix) => file === prefix || file.startsWith(`${prefix}/`),
      )
    ) {
      throw new Error(
        'unknown ignored files retained; inspect them privately before cleanup',
      )
    }
  }
}

function status(repo: Repository): void {
  const all = records(repo)
  const worktrees = git(repo.root, ['worktree', 'list', '--porcelain'])
    .split('\n\n')
    .map((entry) => ({
      path: entry
        .split('\n')
        .find((line) => line.startsWith('worktree '))
        ?.slice(9),
      prunable: entry.split('\n').some((line) => line.startsWith('prunable')),
    }))
    .filter((w) => w.path)
  console.log(
    JSON.stringify(
      {
        limit: MAX_ACTIVE,
        issues: all.map((r) => ({
          ...r,
          missing: !existsSync(r.worktree),
          processAlive:
            alive(r.ownerPid) || alive(r.childPid) || alive(r.proxyPid),
        })),
        unmanaged: worktrees.filter(
          (w) => !all.some((r) => r.worktree === w.path),
        ),
      },
      null,
      2,
    ),
  )
}

function transition(
  repo: Repository,
  record: WorktreeRecord,
  command: string,
  args: string[],
  all: WorktreeRecord[],
): void {
  assertIdle(record)
  assertWorktree(record)
  if (record.phase === 'removed') {
    throw new Error('Issue worktree was removed')
  }
  if (command === 'resume') {
    assertCapacity(all, record.issue)
    if (!record.setupComplete) {
      throw new Error('setup is incomplete')
    }
    checkpoint(record, command)
    record.phase = 'ready'
    delete record.ownerPid
    delete record.childPid
  } else if (command === 'pause') {
    checkpoint(record, command)
    record.phase = 'paused'
  } else if (command === 'finish') {
    const pr = required(args, '--pr')
    const remote = git(repo.root, ['remote', 'get-url', 'origin'])
    const repositoryName = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/.exec(
      remote,
    )?.[1]
    if (
      !repositoryName ||
      !pr.startsWith(`https://github.com/${repositoryName}/pull/`) ||
      !/^https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/[1-9]\d*$/.test(pr)
    ) {
      throw new Error('PR URL must belong to origin repository')
    }
    checkpoint(record, command)
    record.pr = pr
    record.phase = 'finished'
  } else {
    if (required(args, '--confirm') !== String(record.issue)) {
      throw new Error('cleanup confirmation must match Issue number')
    }
    cleanForRemoval(record)
    checkpoint(record, command)
    const archive = path.join(
      repo.registry,
      `archive-${record.issue}-${randomUUID()}`,
    )
    cpSync(path.join(record.worktree, '.agents/harness'), archive, {
      recursive: true,
      filter: (source) => {
        if (lstatSync(source).isSymbolicLink()) {
          throw new Error('Harness archive contains a symlink')
        }
        return source !== path.join(record.worktree, '.agents/harness/runtime')
      },
    })
    git(repo.root, ['worktree', 'remove', record.worktree])
    record.phase = 'removed'
  }
  writeRecord(repo, record)
  console.log(JSON.stringify(record))
}

export async function runWorktreeCli(
  cwd: string,
  args: string[],
): Promise<void> {
  const command = args[0]
  if (
    !command ||
    ![
      'start',
      'status',
      'pause',
      'resume',
      'finish',
      'cleanup',
      'exec',
    ].includes(command)
  ) {
    throw new Error('use start/status/pause/resume/finish/cleanup/exec')
  }
  const repo = repository(cwd)
  if (command === 'status') {
    status(repo)
    return
  }
  if (args.includes('--dry-run')) {
    const all = records(repo)
    const record =
      command === 'start'
        ? newRecord(repo, all, args)
        : all.find((r) => r.issue === issueNumber(args))
    if (!record) {
      throw new Error('Issue is not registered')
    }
    console.log(JSON.stringify({ dryRun: true, command, record }))
    return
  }
  if (command === 'exec') {
    await executeWorktreeTool(args, {
      lock: async (action) => queuedLock(repo, action),
      read: () => records(repo),
      write: (record) => {
        writeRecord(repo, record)
      },
      complete: (record, tool, code, interrupted) => {
        assertWorktree(record)
        assertHarnessIdentity(record)
        checkpointHarnessRun({
          projectRoot: record.worktree,
          runId: record.runId,
          command: `harness:worktree exec ${tool} exit ${code}`,
          notes: `Tool finished: exit=${code}; interrupted=${String(interrupted)}`,
          status: code === 0 ? 'passed' : 'failed',
        })
      },
      issue: issueNumber(args),
      check: (record) => {
        assertCapacity(records(repo), record.issue)
        assertIdle(record)
        assertWorktree(record)
        checkpoint(record, 'exec')
      },
    })
    return
  }
  if (command === 'cleanup') {
    const record = records(repo).find((r) => r.issue === issueNumber(args))
    if (!record) {
      throw new Error('Issue is not registered')
    }
    await Promise.all(
      Object.values(worktreePorts(record.slot)).map(portAvailable),
    )
  }
  if (command === 'start' || command === 'resume') {
    const record = locked(repo, () => {
      const all = records(repo)
      const current =
        command === 'start'
          ? newRecord(repo, all, args)
          : all.find((r) => r.issue === issueNumber(args))
      if (!current) {
        throw new Error('Issue is not registered')
      }
      if (command === 'start') {
        git(repo.root, [
          'worktree',
          'add',
          '-b',
          current.branch,
          current.worktree,
          'origin/develop',
        ])
      } else {
        assertIdle(current)
        assertWorktree(current)
        assertCapacity(all, current.issue)
      }
      current.phase = current.setupComplete ? 'ready' : 'failed'
      current.ownerPid = process.pid
      writeRecord(repo, current)
      return current
    })
    try {
      if (!record.setupComplete) {
        setup(record)
        record.setupComplete = true
      }
      checkpoint(record, command)
      record.phase = 'ready'
    } finally {
      delete record.ownerPid
      delete record.childPid
      delete record.proxyPid
      await queuedLock(repo, () => {
        writeRecord(repo, record)
      })
    }
    console.log(JSON.stringify(record))
    return
  }
  locked(repo, () => {
    const all = records(repo)
    const record = all.find((r) => r.issue === issueNumber(args))
    if (!record) {
      throw new Error('Issue is not registered')
    }
    transition(repo, record, command, args, all)
  })
}
