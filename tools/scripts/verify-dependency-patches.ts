import { execFileSync } from 'node:child_process'

import {
  readPatchSnapshot,
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

export function verifyDependencyPatchSnapshots(
  baseContent: string,
  headContent: string,
  changes: readonly PatchChange[],
  headContents: PatchContents = {},
  parse: (source: string) => unknown = JSON.parse,
): void {
  const base = readPatchSnapshot(parse(baseContent))
  const head = readPatchSnapshot(parse(headContent))
  const added = verifyReviewedPatchAdditions(base, head, {
    ...headContents,
    ...Object.fromEntries(changes.map(({ path, content }) => [path, content])),
  })
  if (new Set(changes.map(({ path }) => path)).size !== changes.length) {
    throw new Error('Duplicate patch file changes')
  }
  for (const change of changes) {
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
  const git = (...args: string[]) =>
    execFileSync('git', args, { encoding: 'utf8' })
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
  for (let index = 0; index < parts.length - 1; index += 2) {
    const status = parts[index]
    const path = parts[index + 1]
    if (!status || !path) {
      throw new Error('Malformed patch diff')
    }
    const tree = git('ls-tree', head, '--', path)
    if (
      status !== 'A' ||
      !tree.startsWith('100644 blob ') ||
      !reviewedPatchAdditions.some((item) => item.path === path)
    ) {
      throw new Error('Unreviewed patch file change')
    }
    changes.push({
      status,
      path,
      mode: tree.split(' ')[0] ?? '',
      content: git('show', `${head}:${path}`),
    })
  }
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
  )
  console.log('Dependency patch changes match reviewed additions')
}

if (import.meta.main) {
  main()
}
