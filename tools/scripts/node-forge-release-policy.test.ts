import { readFileSync } from 'node:fs'
import path from 'node:path'

import JSON5 from 'json5'
import { describe, expect, it } from 'vitest'

import { verifyNodeForgeReleaseBinding } from './node-forge-release-policy'

const integrity =
  'sha512-P6wzfh6t70avmV8FrVEAd/36sOPJQ+hkaJVX1Laap9J/77m7M0eyozDvc8SwnDf4P7MP94gwbAAo0rg3YVXT+g=='
const approvedResolution = ['node-forge@1.4.3', '', {}, integrity]
const manifest = () => ({
  workspaces: ['tools/legacy-tooling'],
  devDependencies: { 'node-forge': '1.4.3' },
  overrides: { 'node-forge': '1.4.3' },
  patchedDependencies: { 'other@1.0.0': 'patches/other.patch' },
})
const lock = () => ({
  lockfileVersion: 1,
  workspaces: { '': { devDependencies: { 'node-forge': '1.4.3' } } },
  overrides: { 'node-forge': '1.4.3' },
  patchedDependencies: { 'other@1.0.0': 'patches/other.patch' },
  packages: {
    'node-forge': structuredClone(approvedResolution),
  } as Record<string, unknown>,
})

describe('reviewed npm node-forge release binding', () => {
  it('accepts the exact reviewed manifest and lockfile', () => {
    expect(() => verifyNodeForgeReleaseBinding(manifest())).not.toThrow()
    expect(() => verifyNodeForgeReleaseBinding(lock())).not.toThrow()
    const root = path.resolve(import.meta.dirname, '../..')
    expect(() =>
      verifyNodeForgeReleaseBinding(
        JSON5.parse<unknown>(readFileSync(path.join(root, 'bun.lock'), 'utf8')),
      ),
    ).not.toThrow()
  })

  it('accepts an explicit npm registry and every approved nested resolution', () => {
    const input = lock()
    input.packages['node-forge'] = [
      'node-forge@1.4.3',
      'https://registry.npmjs.org',
      {},
      integrity,
    ]
    input.packages['parent/node-forge'] = structuredClone(approvedResolution)
    input.packages['@scope/parent/node-forge'] =
      structuredClone(approvedResolution)
    input.packages.alias = structuredClone(approvedResolution)
    input.packages['@types/node-forge'] = [
      '@types/node-forge@1.3.14',
      '',
      {},
      'sha512-unrelated-types',
    ]
    expect(() => verifyNodeForgeReleaseBinding(input)).not.toThrow()
  })

  it.each(['devDependencies', 'overrides'] as const)(
    'rejects an unreviewed manifest %s version',
    (field) => {
      for (const version of [
        '^1.4.3',
        '1.4.4',
        '1.4.0',
        'github:other/forge',
      ]) {
        const input = manifest()
        input[field]['node-forge'] = version
        expect(() => verifyNodeForgeReleaseBinding(input)).toThrow(/node-forge/)
      }
    },
  )

  it.each([
    ['version', ['node-forge@1.4.4', '', {}, integrity]],
    ['old release', ['node-forge@1.4.0', '', {}, integrity]],
    [
      'Git source',
      [
        'node-forge@github:digitalbazaar/forge#ceba344',
        {},
        'archive',
        integrity,
      ],
    ],
    ['integrity', ['node-forge@1.4.3', '', {}, 'sha512-changed']],
    ['registry', ['node-forge@1.4.3', 'https://example.com', {}, integrity]],
    [
      'metadata',
      ['node-forge@1.4.3', '', { dependencies: { bad: '*' } }, integrity],
    ],
    ['array metadata', ['node-forge@1.4.3', '', [], integrity]],
    ['missing integrity', ['node-forge@1.4.3', '', {}]],
    ['extra field', [...approvedResolution, 'extra']],
    ['non-array', null],
  ])('rejects changed resolution %s', (_, resolution) => {
    const input = lock()
    input.packages['node-forge'] = resolution
    expect(() => verifyNodeForgeReleaseBinding(input)).toThrow(/node-forge/)
  })

  it.each(['parent/node-forge', '@scope/parent/node-forge', 'hiddenAlias'])(
    'rejects an unreviewed resolution hidden behind %s',
    (key) => {
      const input = lock()
      input.packages[key] = ['node-forge@1.4.0', '', {}, 'sha512-unreviewed']
      expect(() => verifyNodeForgeReleaseBinding(input)).toThrow(/node-forge/)
    },
  )

  it('rejects a hidden Git archive even if its package alias omits node-forge', () => {
    const input = lock()
    input.packages.hidden = [
      'alias@github:digitalbazaar/forge#ceba344',
      {},
      'archive',
      integrity,
    ]
    expect(() => verifyNodeForgeReleaseBinding(input)).toThrow(/node-forge/)
  })

  it('rejects a hidden Git archive with mixed-case GitHub owner and repository', () => {
    const input = lock()
    input.packages.hidden = [
      'alias@github:DigitalBazaar/FoRgE#ceba344',
      {},
      'archive',
      'sha512-old',
    ]
    expect(() => verifyNodeForgeReleaseBinding(input)).toThrow(/node-forge/)
  })

  it.each([
    ['node-forge@1.4.3', 'patches/other.patch'],
    ['node-forge@github:digitalbazaar/forge#ceba344', 'patches/other.patch'],
    ['node-forge', 'patches/other.patch'],
    ['hidden@1.0.0', 'patches/node-forge-null-parameters.patch'],
  ])('rejects a retained forge patch mapping %s', (key, file) => {
    for (const input of [manifest(), lock()]) {
      Object.assign(input.patchedDependencies, { [key]: file })
      expect(() => verifyNodeForgeReleaseBinding(input)).toThrow(/node-forge/)
    }
  })

  it('rejects changed workspace and lock override bindings', () => {
    const workspace = lock()
    workspace.workspaces[''].devDependencies['node-forge'] = '1.4.0'
    expect(() => verifyNodeForgeReleaseBinding(workspace)).toThrow(/node-forge/)
    const override = lock()
    override.overrides['node-forge'] = '1.4.0'
    expect(() => verifyNodeForgeReleaseBinding(override)).toThrow(/node-forge/)
  })

  it('rejects a missing resolution and unsupported lock version', () => {
    const missing = lock()
    delete missing.packages['node-forge']
    expect(() => verifyNodeForgeReleaseBinding(missing)).toThrow(/missing/)
    const version = lock()
    version.lockfileVersion = 2
    expect(() => verifyNodeForgeReleaseBinding(version)).toThrow(/node-forge/)
  })

  it.each([
    null,
    {},
    [],
    { overrides: { 'node-forge': '1.4.3' }, packages: null },
    { ...lock(), workspaces: [] },
    { ...lock(), patchedDependencies: [] },
    { ...lock(), patchedDependencies: { other: null } },
  ])('rejects malformed snapshots %#', (input) => {
    expect(() => verifyNodeForgeReleaseBinding(input)).toThrow(/node-forge/)
  })

  it('accepts snapshots without unrelated patch mappings or lock metadata', () => {
    const input: Record<string, unknown> = lock()
    delete input.patchedDependencies
    delete input.lockfileVersion
    expect(() => verifyNodeForgeReleaseBinding(input)).not.toThrow()
    const packageInput: Record<string, unknown> = manifest()
    delete packageInput.patchedDependencies
    expect(() => verifyNodeForgeReleaseBinding(packageInput)).not.toThrow()
  })
})
