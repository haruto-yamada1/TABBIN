import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  contextPathStatsUrl,
  main,
  parseContextPathStats,
  verifyContextPath,
} from './verify-codex-context-path'

describe('Codex context path evidence', () => {
  const before = { requests: 0, failed: 0 }
  const after = { requests: 2, failed: 0, model: 'fixture-model' }

  it('rejects a successful Codex reply that bypassed the proxy', () => {
    expect(() =>
      verifyContextPath(before, { ...after, requests: 0 }, 'fixture-model'),
    ).toThrow('No measured proxy request')
  })

  it('accepts measured requests for the selected model', () => {
    expect(() =>
      verifyContextPath(before, after, 'fixture-model'),
    ).not.toThrow()
  })

  it('rejects errors, process resets, and a different model', () => {
    expect(() =>
      verifyContextPath(before, { ...after, failed: 1 }, 'fixture-model'),
    ).toThrow('Proxy failures')
    expect(() =>
      verifyContextPath({ requests: 4, failed: 0 }, after, 'fixture-model'),
    ).toThrow('No measured proxy request')
    expect(() => verifyContextPath(before, after, 'different-model')).toThrow(
      'Measured model',
    )
    expect(() =>
      verifyContextPath(
        { requests: Number.NaN, failed: 0 },
        after,
        'fixture-model',
      ),
    ).toThrow('Invalid baseline')
  })

  it('extracts counters without retaining other server data', () => {
    expect(
      parseContextPathStats({
        summary: { mode: 'cache', primary_model: 'fixture-model' },
        requests: { total: 2, failed: 0 },
        private_field: 'DUMMY_SECRET',
      }),
    ).toEqual(after)
  })

  it.each([
    {},
    {
      summary: { mode: 'token', primary_model: 'fixture-model' },
      requests: { total: 2, failed: 0 },
    },
    {
      summary: { mode: 'cache', primary_model: 'fixture-model' },
      requests: { total: -1, failed: 0 },
    },
  ])('rejects missing, malformed, or incompatible measurements', (value) => {
    expect(() => parseContextPathStats(value)).toThrow('counters')
  })

  it('reads only a dedicated loopback statistics endpoint', () => {
    expect(contextPathStatsUrl('http://127.0.0.1:18787').href).toBe(
      'http://127.0.0.1:18787/stats',
    )
  })

  it.each([
    'https://example.com',
    'http://0.0.0.0:8787',
    'http://127.0.0.1',
    'http://127.0.0.1:8787/?token=DUMMY_SECRET',
    'http://127.0.0.1:8787/other',
    'http://127.0.0.1:8787/#fragment',
  ])('rejects external, credential-bearing, or unrelated URLs', (url) => {
    expect(() => contextPathStatsUrl(url)).toThrow('Use a dedicated')
  })

  it('rejects credentials without storing a credential URI fixture', () => {
    const url = new URL('http://127.0.0.1:8787')
    url.username = 'fixture-user'
    url.password = 'DUMMY_CREDENTIAL'
    expect(() => contextPathStatsUrl(url.href)).toThrow('Use a dedicated')
  })
})

describe('context path CLI counters', () => {
  afterEach(() => vi.restoreAllMocks())

  const mockStats = () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({
        summary: { mode: 'cache', primary_model: 'fixture-model' },
        requests: { total: 2, failed: 0 },
      }),
    )
    vi.spyOn(console, 'log').mockImplementation(() => {})
  }

  it.each([
    ['', '0'],
    ['0', ''],
    [' ', '0'],
    ['0', '\t'],
    [' 0', '0'],
    ['0', '0 '],
    ['0\n', '0'],
    ['0', '0\r\n'],
    ['+0', '0'],
    ['0x0', '0'],
    ['0', '0e0'],
    ['0.0', '0'],
    ['-1', '0'],
    ['9007199254740992', '0'],
  ])('rejects invalid CLI baselines %j', async (requests, failed) => {
    mockStats()
    await expect(
      main(['http://127.0.0.1:18787', requests, failed, 'fixture-model']),
    ).rejects.toThrow('Invalid baseline counters')
  })

  it('accepts explicit decimal counters for measured requests', async () => {
    mockStats()
    await main(['http://127.0.0.1:18787', '0', '0', 'fixture-model'])
    expect(console.log).toHaveBeenCalledWith(
      JSON.stringify({
        requests: 2,
        failed: 0,
        model: 'fixture-model',
        verified: true,
      }),
    )
  })
})
