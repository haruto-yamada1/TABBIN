import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import JSON5 from 'json5'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { reviewedNodeForgeBackport } from './dependency-patch-policy'
import { reviewDependencyChanges } from './dependency-review'
import type { ReviewRequest } from './dependency-review'

const lock = (packages: Record<string, unknown>) =>
  JSON.stringify({ lockfileVersion: 1, workspaces: {}, packages })
const entry = (name: string, version: string) => [
  `${name}@${version}`,
  '',
  {},
  'sha512-fixture',
]
const response = (value: unknown, headers = {}) =>
  Response.json(value, { headers })

const reviewedId = '@stryker-mutator/vitest-runner@10.0.0'
const reviewedPath = 'patches/@stryker-mutator%2Fvitest-runner@10.0.0.patch'
const installedLock = z
  .object({ packages: z.record(z.string(), z.unknown()) })
  .parse(JSON5.parse<unknown>(readFileSync('bun.lock', 'utf8')))
const reviewedEntry: unknown =
  installedLock.packages['@stryker-mutator/vitest-runner']
const reviewedContents = { [reviewedPath]: readFileSync(reviewedPath, 'utf8') }
const reviewedLock = (patched: boolean, packages = { runner: reviewedEntry }) =>
  JSON.stringify({
    lockfileVersion: 1,
    workspaces: {},
    packages,
    patchedDependencies: patched ? { [reviewedId]: reviewedPath } : {},
  })

const doctorLicense = readFileSync('node_modules/react-doctor/LICENSE', 'utf8')
const doctorIntegrity = (version: string) =>
  `sha512-${createHash('sha512').update(version).digest('base64')}`
const doctorEntry = (version: string) => [
  `react-doctor@${version}`,
  '',
  {},
  doctorIntegrity(version),
]
const doctorRequest = (metadata: unknown) =>
  vi
    .fn<ReviewRequest>()
    .mockImplementation(async (url) =>
      url.startsWith('https://api.github.com/')
        ? response([])
        : response(metadata),
    )
const reviewDoctor = async (
  base: Record<string, unknown>,
  head: Record<string, unknown>,
  metadata: unknown,
  contents = { 'react-doctor@0.9.17': doctorLicense },
) =>
  reviewDependencyChanges(
    lock(base),
    lock(head),
    doctorRequest(metadata),
    {},
    contents,
    new Date('2026-10-22T00:00:00Z'),
  )

describe('reviewed React Doctor npm identities', () => {
  const metadata = () => ({
    name: 'react-doctor',
    version: '0.9.17',
    license: 'SEE LICENSE IN LICENSE',
    dist: { integrity: doctorIntegrity('0.9.17') },
  })

  it.each([
    ['react-doctor', 'high'],
    ['react-doctor', 'critical'],
    ['react-doctor', 'unknown'],
    ['oxlint-plugin-react-doctor', 'high'],
    ['oxlint-plugin-react-doctor', 'critical'],
    ['oxlint-plugin-react-doctor', 'unknown'],
  ])(
    'checks unchanged %s versions for %s advisories',
    async (name, severity) => {
      const versions = ['0.9.17', '0.9.18']
      const packages = Object.fromEntries(
        versions.map((version, index) => [
          index ? `nested/${name}` : name,
          [`${name}@${version}`, '', {}, doctorIntegrity(version)],
        ]),
      )
      const request = vi.fn<ReviewRequest>().mockImplementation(async (url) => {
        if (url.startsWith('https://api.github.com/')) {
          return response([
            { ghsa_id: 'GHSA-unchanged', severity, withdrawn_at: null },
          ])
        }
        const version = new URL(url).pathname.split('/').at(-1) ?? ''
        return response({
          ...metadata(),
          name,
          version,
          dist: { integrity: doctorIntegrity(version) },
        })
      })
      const result = await reviewDependencyChanges(
        lock(packages),
        lock(packages),
        request,
        {},
        Object.fromEntries(
          versions.map((version) => [`${name}@${version}`, doctorLicense]),
        ),
        new Date('2026-10-22T00:00:00Z'),
      )
      expect(result).toEqual({
        dependencies: [],
        findings: [`${severity}: GHSA-unchanged`],
      })
      const advisoryRequests = request.mock.calls.filter(([url]) =>
        url.startsWith('https://api.github.com/'),
      )
      expect(advisoryRequests).toHaveLength(1)
      expect(
        new URL(advisoryRequests[0]?.[0] ?? '').searchParams
          .get('affects')
          ?.split(','),
      ).toEqual(versions.map((version) => `${name}@${version}`))
    },
  )

  it('accepts a same-LICENSE version upgrade with npm-matching integrity', async () => {
    expect(
      await reviewDoctor(
        { 'react-doctor': doctorEntry('0.9.16') },
        { 'react-doctor': doctorEntry('0.9.17') },
        metadata(),
      ),
    ).toEqual({ dependencies: ['react-doctor@0.9.17'], findings: [] })
  })

  it('applies the same exact-version npm check to the reviewed plugin', async () => {
    const name = 'oxlint-plugin-react-doctor'
    const version = '0.9.17'
    const result = await reviewDependencyChanges(
      lock({}),
      lock({
        [name]: [`${name}@${version}`, '', {}, doctorIntegrity(version)],
      }),
      doctorRequest({ ...metadata(), name }),
      {},
      { [`${name}@${version}`]: doctorLicense },
      new Date('2026-10-22T00:00:00Z'),
    )
    expect(result).toEqual({
      dependencies: [`${name}@${version}`],
      findings: [],
    })
  })

  it.each([
    undefined,
    {},
    { integrity: 'sha512-bad' },
    { integrity: doctorIntegrity('different') },
  ])(
    'rejects missing, malformed and changed npm distribution integrity (%s)',
    async (dist) => {
      await expect(
        reviewDoctor(
          {},
          { 'react-doctor': doctorEntry('0.9.17') },
          { ...metadata(), dist },
        ),
      ).rejects.toThrow(/integrity|distribution|Invalid/)
    },
  )

  it('checks unchanged reviewed IDs and every same-version nested integrity variant', async () => {
    const packages = {
      'react-doctor': doctorEntry('0.9.17'),
      'nested/react-doctor': [
        'react-doctor@0.9.17',
        '',
        {},
        doctorIntegrity('different'),
      ],
    }
    await expect(reviewDoctor(packages, packages, metadata())).rejects.toThrow(
      /integrity|distribution/,
    )
    const request = doctorRequest(metadata())
    const valid = lock({ 'react-doctor': doctorEntry('0.9.17') })
    expect(
      await reviewDependencyChanges(
        valid,
        valid,
        request,
        {},
        { 'react-doctor@0.9.17': doctorLicense },
        new Date('2026-10-22T00:00:00Z'),
      ),
    ).toEqual({ dependencies: [], findings: [] })
    expect(request).toHaveBeenCalledTimes(2)
    expect(
      new URL(request.mock.calls[0]?.[0] ?? '').searchParams.get('affects'),
    ).toBe('react-doctor@0.9.17')
    expect(request.mock.calls[1]?.[0]).toBe(
      'https://registry.npmjs.org/react-doctor/0.9.17',
    )
  })

  it('requires every unchanged nested version to have approved LICENSE bytes', async () => {
    const packages = {
      'react-doctor': doctorEntry('0.9.17'),
      'nested/react-doctor': doctorEntry('0.9.18'),
    }
    const request = vi.fn<ReviewRequest>().mockImplementation(async (url) => {
      if (url.startsWith('https://api.github.com/')) {
        return response([])
      }
      const version = url.endsWith('/0.9.18') ? '0.9.18' : '0.9.17'
      return response({
        ...metadata(),
        version,
        dist: { integrity: doctorIntegrity(version) },
      })
    })
    const result = await reviewDependencyChanges(
      lock(packages),
      lock(packages),
      request,
      {},
      {
        'react-doctor@0.9.17': doctorLicense,
        'react-doctor@0.9.18': `${doctorLicense}\n`,
      },
      new Date('2026-10-22T00:00:00Z'),
    )
    expect(result.findings).toEqual([
      'license: react-doctor@0.9.18: SEE LICENSE IN LICENSE',
    ])
  })

  it.each(['MIT', 'UNKNOWN', undefined])(
    'never bypasses the reviewed content gate via changed npm license %s',
    async (license) => {
      const result = await reviewDoctor(
        {},
        { 'react-doctor': doctorEntry('0.9.17') },
        { ...metadata(), license },
      )
      expect(result.findings).toHaveLength(1)
    },
  )

  it.each([{ name: 'other' }, { version: '0.9.18' }])(
    'rejects registry identity changes %s',
    async (changed) => {
      await expect(
        reviewDoctor(
          {},
          { 'react-doctor': doctorEntry('0.9.17') },
          { ...metadata(), ...changed },
        ),
      ).rejects.toThrow(/identity mismatch/)
    },
  )
})

describe('Bun dependency changes', () => {
  it.each([
    'MIT-0',
    'Apache-2.0 AND MIT',
    'MIT AND ISC',
    '(MPL-2.0 OR Apache-2.0)',
  ])(
    'accepts the explicitly reviewed permissive license %s',
    async (license) => {
      const request = vi
        .fn<ReviewRequest>()
        .mockImplementation(async (url) =>
          url.startsWith('https://api.github.com/')
            ? response([])
            : response({ name: 'foo', version: '1.0.0', license }),
        )
      const result = await reviewDependencyChanges(
        lock({}),
        lock({ foo: entry('foo', '1.0.0') }),
        request,
      )
      expect(result.findings).toEqual([])
    },
  )

  it.each([
    'MIT OR GPL-3.0-only',
    'MIT AND UNKNOWN',
    'MIT AND Apache-2.0',
    '(MPL-2.0 OR GPL-3.0-only)',
  ])('rejects the unreviewed compound expression %s', async (license) => {
    const request = vi
      .fn<ReviewRequest>()
      .mockImplementation(async (url) =>
        url.startsWith('https://api.github.com/')
          ? response([])
          : response({ name: 'foo', version: '1.0.0', license }),
      )
    expect(
      (
        await reviewDependencyChanges(
          lock({}),
          lock({ foo: entry('foo', '1.0.0') }),
          request,
        )
      ).findings,
    ).toEqual([`license: foo@1.0.0: ${license}`])
  })

  it('accepts the reviewed React Doctor distribution while retaining advisory checks', async () => {
    const name = 'react-doctor'
    const resolution = z
      .tuple([z.string(), z.string(), z.unknown(), z.string()])
      .parse(installedLock.packages[name])
    const id = resolution[0]
    const version = id.slice(`${name}@`.length)
    const request = vi.fn<ReviewRequest>().mockImplementation(async (url) =>
      url.startsWith('https://api.github.com/')
        ? response([
            { ghsa_id: 'GHSA-doctor', severity: 'high', withdrawn_at: null },
          ])
        : response({
            name,
            version,
            license: 'SEE LICENSE IN LICENSE',
            dist: {
              integrity: resolution[3],
            },
          }),
    )
    const result = await reviewDependencyChanges(
      lock({}),
      lock({ [name]: installedLock.packages[name] }),
      request,
      {},
      { [id]: doctorLicense },
      new Date('2026-10-22T00:00:00Z'),
    )
    expect(result.dependencies).toEqual([id])
    expect(result.findings).toEqual(['high: GHSA-doctor'])
  })

  it.each([
    { license: 'Apache-2.0', severity: 'low', expected: [] },
    {
      license: 'Apache-2.0',
      severity: 'high',
      expected: ['high: GHSA-patched'],
    },
    {
      license: undefined,
      severity: 'low',
      expected: [`license: ${reviewedId}: UNKNOWN`],
    },
  ])(
    'scans a reviewed patch addition on an already installed package ($severity/$license)',
    async ({ license, severity, expected }) => {
      const request = vi.fn<ReviewRequest>().mockImplementation(async (url) =>
        url.startsWith('https://api.github.com/')
          ? response([
              { ghsa_id: 'GHSA-patched', severity, withdrawn_at: null },
            ])
          : response({
              name: '@stryker-mutator/vitest-runner',
              version: '10.0.0',
              license,
            }),
      )
      const result = await reviewDependencyChanges(
        reviewedLock(false),
        reviewedLock(true),
        request,
        reviewedContents,
      )
      expect(result.dependencies).toEqual([reviewedId])
      expect(result.findings).toEqual(expected)
      expect(request).toHaveBeenCalledTimes(2)
    },
  )

  it('detects a dangerous added transitive dependency despite an empty GitHub graph', async () => {
    const request = vi.fn<ReviewRequest>().mockImplementation(async (input) =>
      input.startsWith('https://api.github.com/')
        ? response([
            {
              ghsa_id: 'GHSA-fixture-high',
              severity: 'high',
              withdrawn_at: null,
            },
          ])
        : response({ name: 'lodash', version: '4.17.20', license: 'MIT' }),
    )
    const result = await reviewDependencyChanges(
      lock({ parent: entry('parent', '1.0.0') }),
      lock({
        parent: entry('parent', '1.0.0'),
        'parent/lodash': entry('lodash', '4.17.20'),
      }),
      request,
    )
    expect(result.dependencies).toEqual(['lodash@4.17.20'])
    expect(result.findings).toContain('high: GHSA-fixture-high')
  })

  it('checks every nested version and fails disallowed and missing licenses', async () => {
    const request = vi.fn<ReviewRequest>().mockImplementation(async (url) => {
      if (url.startsWith('https://api.github.com/')) {
        return response([])
      }
      return response({
        name: '@scope/nested',
        version: url.endsWith('/1.0.0') ? '1.0.0' : '2.0.0',
        ...(url.endsWith('/1.0.0') ? { license: 'GPL-3.0-only' } : {}),
      })
    })
    const result = await reviewDependencyChanges(
      lock({}),
      lock({
        '@scope/nested': entry('@scope/nested', '1.0.0'),
        'parent/@scope/nested': entry('@scope/nested', '2.0.0'),
      }),
      request,
    )
    expect(result.dependencies).toHaveLength(2)
    expect(result.findings).toHaveLength(2)
  })

  it.each([
    [new Response('', { status: 503 }), 'HTTP 503'],
    [response({}), 'Invalid input'],
    [
      response([], {
        link: '<https://api.github.com/advisories?after=next>; rel="next"',
      }),
      'pagination',
    ],
  ] as const)(
    'fails closed on incomplete service responses (%s)',
    async (value, message) => {
      const request = vi.fn<ReviewRequest>().mockResolvedValue(value)
      await expect(
        reviewDependencyChanges(
          lock({}),
          lock({ foo: entry('foo', '1.0.0') }),
          request,
        ),
      ).rejects.toThrow(message)
    },
  )

  it.each([
    { value: [] },
    { value: ['bad'] },
    { value: ['foo@github:attacker/foo#abc'] },
    { value: ['foo@file:/tmp/foo'] },
  ])(
    'rejects malformed lock entries and new sources ($value)',
    async ({ value }) => {
      await expect(
        reviewDependencyChanges(lock({}), lock({ foo: value })),
      ).rejects.toThrow(/Malformed|Unable to parse|Unsupported/)
    },
  )

  it('does not fetch unchanged dependencies or removals', async () => {
    const request = vi.fn<ReviewRequest>()
    const result = await reviewDependencyChanges(
      lock({ foo: entry('foo', '1.0.0') }),
      lock({}),
      request,
    )
    expect(result).toEqual({ dependencies: [], findings: [] })
    expect(request).not.toHaveBeenCalled()
  })

  it('accepts a safe update, including an object license, without blocking below-threshold advisories', async () => {
    const request = vi.fn<ReviewRequest>().mockImplementation(async (input) =>
      input.startsWith('https://api.github.com/')
        ? response([
            {
              ghsa_id: 'GHSA-low-fixture',
              severity: 'medium',
              withdrawn_at: null,
            },
          ])
        : response({
            name: 'foo',
            version: '2.0.0',
            license: { type: 'MIT' },
          }),
    )
    const result = await reviewDependencyChanges(
      lock({ foo: entry('foo', '1.0.0') }),
      lock({ foo: entry('foo', '2.0.0') }),
      request,
    )
    expect(result).toEqual({ dependencies: ['foo@2.0.0'], findings: [] })
    expect(request.mock.calls[0]?.[0]).toContain('affects=foo%402.0.0')
    expect(request.mock.calls[1]?.[1]?.redirect).toBe('error')
  })

  it('rejects critical and unknown severity and ignores withdrawn advisories', async () => {
    const request = vi.fn<ReviewRequest>().mockImplementation(async (input) =>
      input.startsWith('https://api.github.com/')
        ? response([
            {
              ghsa_id: 'GHSA-critical-fixture',
              severity: 'critical',
              withdrawn_at: null,
            },
            {
              ghsa_id: 'GHSA-unknown-fixture',
              severity: 'unknown',
              withdrawn_at: null,
            },
            {
              ghsa_id: 'GHSA-withdrawn-fixture',
              severity: 'high',
              withdrawn_at: '2026-01-01',
            },
          ])
        : response({ name: 'foo', version: '1.0.0', license: 'MIT' }),
    )
    const result = await reviewDependencyChanges(
      lock({}),
      lock({ foo: entry('foo', '1.0.0') }),
      request,
    )
    expect(result.findings).toEqual([
      'critical: GHSA-critical-fixture',
      'unknown: GHSA-unknown-fixture',
    ])
  })

  it('rechecks same-version integrity changes and refuses registry identity mismatch', async () => {
    const request = vi
      .fn<ReviewRequest>()
      .mockImplementation(async (input) =>
        input.startsWith('https://api.github.com/')
          ? response([])
          : response({ name: 'foo', version: '2.0.0', license: 'MIT' }),
      )
    const changed = entry('foo', '1.0.0')
    changed[3] = 'sha512-changed'
    await expect(
      reviewDependencyChanges(
        lock({ foo: entry('foo', '1.0.0') }),
        lock({ foo: changed }),
        request,
      ),
    ).rejects.toThrow('identity mismatch')
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('accepts the approved backport on its first main release and rejects patch/source changes', async () => {
    const {
      dependency,
      path,
      resolution: forge,
      source,
    } = reviewedNodeForgeBackport
    const base = JSON.stringify({
      lockfileVersion: 1,
      workspaces: { '': { devDependencies: { 'node-forge': source } } },
      overrides: { 'node-forge': source },
      packages: { 'node-forge': forge },
      patchedDependencies: { [dependency]: path },
    })
    const contents = { [path]: readFileSync(path, 'utf8') }
    const request = vi.fn<ReviewRequest>()
    expect(
      await reviewDependencyChanges(lock({}), base, request, contents),
    ).toEqual({
      dependencies: [],
      findings: [],
    })
    expect(
      await reviewDependencyChanges(base, base, request, contents),
    ).toEqual({
      dependencies: [],
      findings: [],
    })
    await expect(
      reviewDependencyChanges(
        base,
        JSON.stringify({
          ...JSON.parse(base),
          packages: { 'node-forge': [...forge.slice(0, 3), 'sha512-changed'] },
        }),
        request,
        contents,
      ),
    ).rejects.toThrow(/patch/)
    await expect(
      reviewDependencyChanges(
        base,
        JSON.stringify({
          ...JSON.parse(base),
          patchedDependencies: { forge: 'new-patch' },
        }),
        request,
        contents,
      ),
    ).rejects.toThrow('patch changes')
    expect(request).not.toHaveBeenCalled()
  })

  it('recognizes local workspaces while checking their third-party dependencies', async () => {
    const content = JSON.stringify({
      lockfileVersion: 1,
      workspaces: { tools: { name: 'local-tools' } },
      packages: { 'local-tools': ['local-tools@workspace:tools'] },
    })
    expect(await reviewDependencyChanges(content, content)).toEqual({
      dependencies: [],
      findings: [],
    })
    await expect(
      reviewDependencyChanges(
        lock({}),
        lock({ 'local-tools': ['local-tools@workspace:unknown'] }),
      ),
    ).rejects.toThrow('workspace')
  })
})
