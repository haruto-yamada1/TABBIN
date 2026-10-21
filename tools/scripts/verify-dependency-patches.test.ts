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
