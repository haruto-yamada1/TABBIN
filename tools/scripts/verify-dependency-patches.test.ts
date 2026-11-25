import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import JSON5 from 'json5'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  reviewedNodeForgeBackport,
  verifyReviewedPatchAdditions,
} from './dependency-patch-policy'
import type { PatchContents } from './dependency-patch-policy'
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
// Retain the reviewed historical artifact after the live patch is retired.
const forgeContent = `diff --git a/lib/rsa.js b/lib/rsa.js
--- a/lib/rsa.js
+++ b/lib/rsa.js
@@ -1178,5 +1178,6 @@
             obj.value.length !== 2 ||
             obj.value[0].value.length !==
-              (('parameters' in capture) ? 2 : 1)) {
+              (('parameters' in capture) ? 2 : 1) ||
+            (('parameters' in capture) && capture.parameters !== '')) {
             var error = new Error(
               'ASN.1 object does not contain a valid RSASSA-PKCS1-v1_5 ' +
`
const forgeEntry = reviewedNodeForgeBackport.resolution
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

const releasedForgeEntry = [
  'node-forge@1.4.3',
  '',
  {},
  'sha512-P6wzfh6t70avmV8FrVEAd/36sOPJQ+hkaJVX1Laap9J/77m7M0eyozDvc8SwnDf4P7MP94gwbAAo0rg3YVXT+g==',
]
const retirementBase = {
  ...forgeHead,
  packages: {
    ...forgeHead.packages,
    'nested/node-forge': forgeEntry,
    alias: forgeEntry,
    runner: entry,
  },
  patchedDependencies: { ...forgeHead.patchedDependencies, [id]: path },
}
const retirementHead = {
  workspaces: { '': { devDependencies: { 'node-forge': '1.4.3' } } },
  overrides: { 'node-forge': '1.4.3' },
  packages: {
    'node-forge': releasedForgeEntry,
    'nested/node-forge': releasedForgeEntry,
    alias: releasedForgeEntry,
    runner: entry,
  },
  patchedDependencies: { [id]: path },
}
const retirementChange = { ...forgeChange, status: 'D' }
const retirementBaseContents = { ...forgeContents, ...contents }
const verifyRetirement = (
  snapshot: unknown = retirementHead,
  changes: readonly PatchChange[] = [retirementChange],
  baseContents: PatchContents = retirementBaseContents,
  headContents: PatchContents = contents,
) =>
  verifyDependencyPatchSnapshots(
    JSON.stringify(retirementBase),
    JSON.stringify(snapshot),
    changes,
    headContents,
    JSON.parse,
    baseContents,
  )

const verifyGitRetirement = (basePatch = forgeContent) => {
  const directory = mkdtempSync(join(tmpdir(), 'tabbin-forge-retirement-'))
  const git = (...args: string[]) =>
    execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
      cwd: directory,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  const commit = () => {
    git('add', '--all')
    git(
      '-c',
      'user.name=TABBIN test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '--quiet',
      '--no-gpg-sign',
      '-m',
      'fixture',
    )
    return git('rev-parse', 'HEAD')
  }
  try {
    git('init', '--quiet')
    mkdirSync(join(directory, 'patches'))
    writeFileSync(join(directory, forgePath), basePatch)
    writeFileSync(join(directory, path), content)
    writeFileSync(join(directory, 'bun.lock'), JSON.stringify(retirementBase))
    const base = commit()
    rmSync(join(directory, forgePath))
    writeFileSync(join(directory, 'bun.lock'), JSON.stringify(retirementHead))
    const head = commit()
    return execFileSync(
      'bun',
      [fileURLToPath(new URL('verify-dependency-patches.ts', import.meta.url))],
      {
        cwd: directory,
        encoding: 'utf8',
        env: { ...process.env, BASE_SHA: base, HEAD_SHA: head },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('reviewed node-forge backport retirement', () => {
  it('accepts only the verified backport deletion with the exact registry replacement', () => {
    expect(() => verifyRetirement()).not.toThrow()
  })

  it('reads the deleted regular patch bytes from the actual base Git tree', () => {
    expect(verifyGitRetirement()).toContain('reviewed transitions')
  })

  it('rejects a tampered historical Git blob even after the patch is deleted', () => {
    expect(() => verifyGitRetirement(`${forgeContent}\n`)).toThrow(/patch/)
  })

  it('requires the matching git deletion and approved historical bytes', () => {
    expect(() => verifyRetirement(retirementHead, [])).toThrow(/patch/)
    for (const baseContents of [
      {},
      { ...retirementBaseContents, [forgePath]: `${forgeContent}\n` },
    ]) {
      expect(() =>
        verifyRetirement(retirementHead, [retirementChange], baseContents),
      ).toThrow(/patch/)
    }
    expect(() =>
      verifyRetirement(retirementHead, [
        { ...retirementChange, content: `${forgeContent}\n` },
      ]),
    ).toThrow(/patch/)
  })

  it.each(['M', 'R100', 'A'])(
    'rejects retirement disguised as file status %s',
    (status) => {
      expect(() =>
        verifyRetirement(retirementHead, [{ ...retirementChange, status }]),
      ).toThrow(/patch/)
    },
  )

  it.each(['100755', '120000'])(
    'rejects deletion of historical patch mode %s',
    (mode) => {
      expect(() =>
        verifyRetirement(retirementHead, [{ ...retirementChange, mode }]),
      ).toThrow(/patch/)
    },
  )

  it('rejects removal without the fully pinned replacement and every bound resolution', () => {
    for (const snapshot of [
      { ...retirementHead, packages: {} },
      { ...retirementHead, workspaces: {} },
      { ...retirementHead, overrides: { 'node-forge': '^1.4.3' } },
      {
        ...retirementHead,
        packages: { ...retirementHead.packages, alias: forgeEntry },
      },
      {
        ...retirementHead,
        packages: {
          ...retirementHead.packages,
          'nested/node-forge': [
            ...releasedForgeEntry.slice(0, 3),
            'sha512-changed',
          ],
        },
      },
      {
        ...retirementHead,
        patchedDependencies: {
          ...retirementHead.patchedDependencies,
          [forgeId]: forgePath,
        },
      },
    ]) {
      expect(() => verifyRetirement(snapshot)).toThrow(/patch|node-forge/)
    }
    expect(() =>
      verifyRetirement(
        retirementHead,
        [retirementChange],
        retirementBaseContents,
        {
          ...contents,
          ...forgeContents,
        },
      ),
    ).toThrow(/patch/)
  })

  it('requires the reviewed source, map and all resolutions in the base snapshot', () => {
    for (const snapshot of [
      { ...retirementBase, overrides: { 'node-forge': '^1.4.0' } },
      { ...retirementBase, packages: {} },
      {
        ...retirementBase,
        packages: {
          ...retirementBase.packages,
          alias: [...forgeEntry.slice(0, 3), 'sha512-changed'],
        },
      },
      {
        ...retirementBase,
        patchedDependencies: {
          [id]: path,
          [forgeId]: 'patches/elsewhere.patch',
        },
      },
    ]) {
      expect(() =>
        verifyDependencyPatchSnapshots(
          JSON.stringify(snapshot),
          JSON.stringify(retirementHead),
          [retirementChange],
          contents,
          JSON.parse,
          retirementBaseContents,
        ),
      ).toThrow(/patch/)
    }
  })

  it('preserves rejection of other patch changes beside the retirement', () => {
    for (const other of [
      { ...change, status: 'D' },
      { ...change, status: 'M' },
      { ...change, path: 'patches/unreviewed.patch' },
    ]) {
      expect(() =>
        verifyRetirement(retirementHead, [retirementChange, other]),
      ).toThrow(/patch/)
    }
    expect(() =>
      verifyRetirement({ ...retirementHead, patchedDependencies: {} }),
    ).toThrow(/patch/)
  })
})

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
