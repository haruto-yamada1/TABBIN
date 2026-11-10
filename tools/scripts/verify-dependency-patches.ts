import { execFileSync } from 'node:child_process'

import {
  isReviewedNodeForgeRetirement,
  readPatchSnapshot,
  reviewedNodeForgeBackport,
  reviewedPatchAdditions,
  verifyReviewedPatchAdditions,
} from './dependency-patch-policy'
import type { PatchContents } from './dependency-patch-policy'

export type PatchChange = {
  path: string
  status: string
  mode: string
  content: string
}

function verifyPatchFileChange(
  change: PatchChange,
  added: readonly string[],
  retiringForge: boolean,
  baseContents: PatchContents,
): void {
  const forge = reviewedNodeForgeBackport
  if (
    retiringForge &&
    change.path === forge.path &&
    change.status === 'D' &&
    change.mode === '100644' &&
    change.content === baseContents[forge.path]
  ) {
    return
  }
  const reviewed = reviewedPatchAdditions.find(
    ({ path }) => path === change.path,
  )
  if (
    !reviewed ||
    change.status !== 'A' ||
    change.mode !== '100644' ||
    !added.includes(reviewed.dependency)
  ) {
    throw new Error('Unreviewed patch file change')
  }
}

export function verifyDependencyPatchSnapshots(
  baseContent: string,
  headContent: string,
  changes: readonly PatchChange[],
  headContents: PatchContents = {},
  parse: (source: string) => unknown = JSON.parse,
  baseContents: PatchContents = {},
): void {
  const base = readPatchSnapshot(parse(baseContent))
  const head = readPatchSnapshot(parse(headContent))
  const added = verifyReviewedPatchAdditions(
    base,
    head,
    {
      ...headContents,
      ...Object.fromEntries(
        changes
          .filter(({ status }) => status !== 'D')
          .map(({ path, content }) => [path, content]),
      ),
    },
    baseContents,
  )
  const forge = reviewedNodeForgeBackport
  const retiringForge = isReviewedNodeForgeRetirement(base, head)
  if (new Set(changes.map(({ path }) => path)).size !== changes.length) {
    throw new Error('Duplicate patch file changes')
  }
  for (const change of changes) {
    verifyPatchFileChange(change, added, retiringForge, baseContents)
  }
  if (
    retiringForge &&
    !changes.some(({ path, status }) => path === forge.path && status === 'D')
  ) {
    throw new Error('Reviewed patch retirement has no matching git deletion')
  }
  if (
    added.some(
      (dependency) =>
        !changes.some(({ path }) =>
          reviewedPatchAdditions.some(
            (item) => item.dependency === dependency && item.path === path,
          ),
        ),
    )
  ) {
    throw new Error('Reviewed patch addition has no matching git file addition')
  }
}

function parseBunLock(source: string): unknown {
  const runtime: unknown = Reflect.get(globalThis, 'Bun')
  if (
    typeof runtime !== 'object' ||
    runtime === null ||
    !('JSON5' in runtime)
  ) {
    throw new Error('Bun JSON5 parser is required')
  }
  const parser = runtime.JSON5
  if (
    typeof parser !== 'object' ||
    parser === null ||
    !('parse' in parser) ||
    typeof parser.parse !== 'function'
  ) {
    throw new Error('Bun JSON5 parser is required')
  }
  return Reflect.apply(parser.parse, parser, [source])
}

type Git = (...args: string[]) => string

function readPatchChanges(base: string, head: string, git: Git) {
  const parts = git(
    'diff',
    '--name-status',
    '--no-renames',
    '-z',
    base,
    head,
    '--',
    'patches/',
  ).split('\0')
  const changes: PatchChange[] = []
  const baseContents: Record<string, string> = {}
  for (let index = 0; index < parts.length - 1; index += 2) {
    const status = parts[index]
    const path = parts[index + 1]
    if (!status || !path) {
      throw new Error('Malformed patch diff')
    }
    const retiringForge =
      status === 'D' && path === reviewedNodeForgeBackport.path
    const tree = git('ls-tree', retiringForge ? base : head, '--', path)
    if (
      (status !== 'A' && !retiringForge) ||
      !tree.startsWith('100644 blob ') ||
      !reviewedPatchAdditions.some((item) => item.path === path) ||
      (retiringForge && git('ls-tree', head, '--', path) !== '')
    ) {
      throw new Error('Unreviewed patch file change')
    }
    const content = git('show', `${retiringForge ? base : head}:${path}`)
    if (retiringForge) {
      baseContents[path] = content
    }
    changes.push({
      status,
      path,
      mode: tree.split(' ')[0] ?? '',
      content,
    })
  }
  return { changes, baseContents }
}

export function main(): void {
  const base = process.env.BASE_SHA
  const head = process.env.HEAD_SHA
  if (
    !base ||
    !head ||
    !/^[a-f0-9]{40}$/.test(base) ||
    !/^[a-f0-9]{40}$/.test(head)
  ) {
    throw new Error('BASE_SHA and HEAD_SHA must be full commit hashes')
  }
  const git: Git = (...args) => execFileSync('git', args, { encoding: 'utf8' })
  const { changes, baseContents } = readPatchChanges(base, head, git)
  const headContents: Record<string, string> = {}
  for (const { path } of reviewedPatchAdditions) {
    const tree = git('ls-tree', head, '--', path)
    if (!tree) {
      continue
    }
    if (!tree.startsWith('100644 blob ')) {
      throw new Error('Reviewed patch must be a regular file')
    }
    headContents[path] = git('show', `${head}:${path}`)
  }
  verifyDependencyPatchSnapshots(
    git('show', `${base}:bun.lock`),
    git('show', `${head}:bun.lock`),
    changes,
    headContents,
    parseBunLock,
    baseContents,
  )
  console.log('Dependency patch changes match reviewed transitions')
}

if (import.meta.main) {
  main()
}
