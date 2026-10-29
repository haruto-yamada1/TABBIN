import { readFileSync } from 'node:fs'

import JSON5 from 'json5'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { verifyReviewedPatchAdditions } from './dependency-patch-policy'
import { verifyDependencyPatchSnapshots } from './verify-dependency-patches'
import type { PatchChange } from './verify-dependency-patches'

const id = '@stryker-mutator/vitest-runner@10.0.0'
const path = 'patches/@stryker-mutator%2Fvitest-runner@10.0.0.patch'
const content = readFileSync(path, 'utf8')
const entry = z
  .object({ packages: z.record(z.string(), z.unknown()) })
  .parse(JSON5.parse<unknown>(readFileSync('bun.lock', 'utf8'))).packages[
  '@stryker-mutator/vitest-runner'
]
const base = { packages: { runner: entry }, patchedDependencies: {} }
const head = { ...base, patchedDependencies: { [id]: path } }
const change: PatchChange = { path, content, status: 'A', mode: '100644' }
const contents = { [path]: content }
const verify = (changes: readonly PatchChange[]) =>
  verifyDependencyPatchSnapshots(
    JSON.stringify(base),
    JSON.stringify(head),
    changes,
  )

const forgeId = 'node-forge@github:digitalbazaar/forge#ceba344'
const forgePath = 'patches/node-forge-null-parameters.patch'
const forgeSource =
  'github:digitalbazaar/forge#ceba34402e329f0365134f23fe19898756527d65'
const forgeContent = readFileSync(forgePath, 'utf8')
const forgeEntry = z
  .object({ packages: z.record(z.string(), z.unknown()) })
  .parse(JSON5.parse<unknown>(readFileSync('bun.lock', 'utf8'))).packages[
  'node-forge'
]
const forgeBase = {
  packages: {},
  patchedDependencies: {},
  workspaces: { '': { devDependencies: { 'node-forge': forgeSource } } },
  overrides: { 'node-forge': forgeSource },
}
const forgeHead = {
  ...forgeBase,
  packages: { 'node-forge': forgeEntry },
  patchedDependencies: { [forgeId]: forgePath },
}
const forgeChange = {
  path: forgePath,
  content: forgeContent,
  status: 'A',
  mode: '100644',
}
const forgeContents = { [forgePath]: forgeContent }
const verifyForge = (
  changes: readonly PatchChange[] = [forgeChange],
  snapshot: unknown = forgeHead,
) =>
  verifyDependencyPatchSnapshots(
    JSON.stringify(forgeBase),
    JSON.stringify(snapshot),
    changes,
  )

describe('reviewed node-forge backport patch boundaries', () => {
  it('accepts the approved Git backport addition beside the Stryker addition', () => {
    expect(() => verifyForge()).not.toThrow()
    expect(() =>
      verifyDependencyPatchSnapshots(
        JSON.stringify({ ...forgeBase, packages: { runner: entry } }),
        JSON.stringify({
          ...forgeHead,
          packages: { ...forgeHead.packages, runner: entry },
          patchedDependencies: { ...forgeHead.patchedDependencies, [id]: path },
        }),
        [forgeChange, change],
      ),
    ).not.toThrow()
  })

  it('accepts unchanged approved bytes with all nested resolutions bound', () => {
    const nestedHead = {
      ...forgeHead,
      packages: {
        ...forgeHead.packages,
        'nested/node-forge': forgeEntry,
        alias: forgeEntry,
      },
    }
    expect(() =>
      verifyDependencyPatchSnapshots(
        JSON.stringify(nestedHead),
        JSON.stringify(nestedHead),
        [],
        forgeContents,
      ),
    ).not.toThrow()
  })

  it.each(['M', 'D', 'R100'])(
    'rejects existing node-forge patch file status %s',
    (status) => {
      expect(() => verifyForge([{ ...forgeChange, status }])).toThrow(/patch/)
    },
  )

  it.each(['100755', '120000'])(
    'rejects node-forge executable or symlink mode %s',
    (mode) => {
      expect(() => verifyForge([{ ...forgeChange, mode }])).toThrow(/patch/)
    },
  )

  it('rejects changed bytes and orphaned node-forge file/map additions', () => {
    expect(() =>
      verifyForge([{ ...forgeChange, content: `${forgeContent}\n` }]),
    ).toThrow(/patch/)
    expect(() => verifyForge([])).toThrow(/patch/)
    expect(() =>
      verifyForge([forgeChange], {
        ...forgeHead,
        patchedDependencies: {},
      }),
    ).toThrow(/patch/)
  })

  it('rejects the backport resolution or retained patch without its map', () => {
    const missingMap = { ...forgeHead, patchedDependencies: {} }
    expect(() => verifyForge([], missingMap)).toThrow(/patch/)
    expect(() =>
      verifyDependencyPatchSnapshots(
        JSON.stringify(forgeBase),
        JSON.stringify(forgeBase),
        [],
        forgeContents,
      ),
    ).toThrow(/patch/)
  })

  it('rejects edits and deletion of the approved node-forge map', () => {
    for (const patchedDependencies of [
      {},
      { [forgeId]: 'patches/elsewhere.patch' },
    ]) {
      expect(() =>
        verifyDependencyPatchSnapshots(
          JSON.stringify(forgeHead),
          JSON.stringify({ ...forgeHead, patchedDependencies }),
          [],
          forgeContents,
        ),
      ).toThrow(/patch/)
    }
  })

  it('rejects missing and mismatched top-level or nested node-forge tuples', () => {
    const tuple = z.array(z.unknown()).parse(forgeEntry)
    const wrongTuples = [
      ['node-forge@1.3.1', '', {}, 'sha512-registry'],
      [tuple[0], { dependencies: { injected: '*' } }, ...tuple.slice(2)],
      [tuple[0], [], ...tuple.slice(2)],
      [tuple[0], {}, 'digitalbazaar-forge-changed', tuple[3]],
      [...tuple.slice(0, 3), 'sha512-changed'],
      [...tuple, 'extra'],
      null,
    ]
    expect(() =>
      verifyForge([forgeChange], { ...forgeHead, packages: {} }),
    ).toThrow(/patch/)
    for (const bad of wrongTuples) {
      for (const key of ['node-forge', 'nested/node-forge']) {
        expect(() =>
          verifyForge([forgeChange], {
            ...forgeHead,
            packages: { 'node-forge': forgeEntry, [key]: bad },
          }),
        ).toThrow(/patch/)
      }
    }
    expect(() =>
      verifyForge([forgeChange], {
        ...forgeHead,
        packages: {
          'node-forge': forgeEntry,
          alias: [...tuple.slice(0, 3), 'sha512-changed'],
        },
      }),
    ).toThrow(/patch/)
  })

  it('ignores scoped names that are not node-forge resolutions', () => {
    expect(() =>
      verifyForge([forgeChange], {
        ...forgeHead,
        packages: {
          ...forgeHead.packages,
          '@types/node-forge': ['@types/node-forge@1.3.14', '', {}, 'types'],
          'nested/@types/node-forge': null,
        },
      }),
    ).not.toThrow()
  })

  it('rejects missing or changed full Git source and override pins', () => {
    for (const snapshot of [
      { ...forgeHead, workspaces: undefined },
      { ...forgeHead, overrides: undefined },
      { ...forgeHead, overrides: { 'node-forge': '^1.3.1' } },
      {
        ...forgeHead,
        workspaces: {
          '': { devDependencies: { 'node-forge': `${forgeSource}changed` } },
        },
      },
    ]) {
      expect(() => verifyForge([forgeChange], snapshot)).toThrow(/patch/)
    }
  })
})

describe('reviewed dependency patch boundaries', () => {
  it.each(['__proto__', 'constructor', 'toString'])(
    'rejects unknown own-key patch mapping %s',
    (key) => {
      const unknownHead = {
        ...base,
        patchedDependencies: Object.fromEntries([
          [key, 'patches/unreviewed.patch'],
        ]),
      }
      expect(() => verifyReviewedPatchAdditions(base, unknownHead, {})).toThrow(
        /patch/,
      )
    },
  )

  it('accepts only the matching reviewed map and regular file addition', () => {
    expect(() => verify([change])).not.toThrow()
  })

  it('accepts an unchanged approved patch on subsequent PRs', () => {
    expect(() =>
      verifyDependencyPatchSnapshots(
        JSON.stringify(head),
        JSON.stringify(head),
        [],
        contents,
      ),
    ).not.toThrow()
  })

  it.each(['M', 'D', 'R100'])('rejects existing-file status %s', (status) => {
    expect(() => verify([{ ...change, status }])).toThrow(/patch/)
  })

  it.each(['100755', '120000'])(
    'rejects executable/symlink mode %s',
    (mode) => {
      expect(() => verify([{ ...change, mode }])).toThrow(/patch/)
    },
  )

  it('rejects changed bytes and unknown files beside a reviewed addition', () => {
    expect(() => verify([{ ...change, content: `${content}\n` }])).toThrow(
      /patch/,
    )
    expect(() =>
      verify([change, { ...change, path: 'patches/orphan.patch' }]),
    ).toThrow(/patch/)
  })

  it('rejects orphaned map or orphaned reviewed file additions', () => {
    expect(() => verify([])).toThrow(/patch/)
    expect(() =>
      verifyDependencyPatchSnapshots(
        JSON.stringify(base),
        JSON.stringify(base),
        [change],
      ),
    ).toThrow(/patch/)
  })

  it('rejects changes/deletion of an already approved mapping', () => {
    expect(() => verifyReviewedPatchAdditions(head, base, contents)).toThrow(
      /patch/,
    )
    expect(() =>
      verifyReviewedPatchAdditions(
        head,
        {
          ...head,
          patchedDependencies: { [id]: 'patches/elsewhere.patch' },
        },
        contents,
      ),
    ).toThrow(/patch/)
  })

  it('rejects wrong versions, malformed sources and mismatched nested integrity', () => {
    const tuple = z.array(z.unknown()).parse(entry)
    for (const bad of [
      ['@stryker-mutator/vitest-runner@10.0.1', ...tuple.slice(1)],
      [tuple[0], 'https://evil.invalid', ...tuple.slice(2)],
      [...tuple.slice(0, 3), 'sha512-changed'],
    ]) {
      expect(() =>
        verifyReviewedPatchAdditions(
          base,
          {
            ...head,
            packages: { runner: bad },
          },
          contents,
        ),
      ).toThrow(/patch/)
    }
    expect(() =>
      verifyReviewedPatchAdditions(
        base,
        {
          ...head,
          packages: {
            runner: entry,
            nested: [...tuple.slice(0, 3), 'sha512-changed'],
          },
        },
        contents,
      ),
    ).toThrow(/patch/)
  })

  it('rejects edits after the reviewed patch reaches base', () => {
    expect(() =>
      verifyDependencyPatchSnapshots(
        JSON.stringify(head),
        JSON.stringify(head),
        [{ ...change, status: 'M' }],
        contents,
      ),
    ).toThrow(/patch/)
  })
})
