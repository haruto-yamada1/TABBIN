import { readFileSync } from 'node:fs'

import JSON5 from 'json5'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

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

describe('Bun dependency changes', () => {
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

  it('preserves only the unchanged node-forge snapshot and rejects patch/source changes', async () => {
    const forge = [
      'node-forge@github:digitalbazaar/forge#ceba344',
      {},
      'digitalbazaar-forge-ceba344',
      'sha512-fixture',
    ]
    const base = lock({ 'node-forge': forge })
    const request = vi.fn<ReviewRequest>()
    expect(await reviewDependencyChanges(base, base, request)).toEqual({
      dependencies: [],
      findings: [],
    })
    await expect(
      reviewDependencyChanges(
        base,
        lock({ 'node-forge': [...forge.slice(0, 3), 'sha512-changed'] }),
        request,
      ),
    ).rejects.toThrow('Unsupported')
    await expect(
      reviewDependencyChanges(
        base,
        JSON.stringify({
          ...JSON.parse(base),
          patchedDependencies: { forge: 'new-patch' },
        }),
        request,
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
