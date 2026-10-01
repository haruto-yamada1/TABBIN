import { describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import {
  checkHardBudgets,
  parseSizePolicy,
  parseSizeReport,
  renderSizeReport,
} from './artifactSizeComparison'
import type {
  SizeArtifact,
  SizePolicy,
  SizeReport,
} from './artifactSizeComparison'

const createArtifact = (
  overrides: Partial<SizeArtifact> = {},
): SizeArtifact => ({
  zipBytes: 1_000,
  unpackedBytes: 4_000,
  javascriptBytes: 3_000,
  assetCount: 10,
  entries: { 'background.js': 1_000, 'chunks/options.js': 82 },
  chunks: { 'chunks/OptionsRoute.js': 500, 'chunks/other.js': 200 },
  largestAssets: [{ path: 'background.js', bytes: 1_000 }],
  ...overrides,
})

const createReport = (
  chrome: Partial<SizeArtifact> = {},
  firefox: Partial<SizeArtifact> = {},
): SizeReport => ({
  schemaVersion: 1,
  revision: 'current-revision',
  environment: 'Linux x64; Node 22; Bun 1.3',
  browsers: {
    chrome: createArtifact(chrome),
    firefox: createArtifact(firefox),
  },
})

const policy: SizePolicy = {
  reportPercent: 5,
  reviewPercent: 10,
  hardBudgets: [],
}

describe('artifact size schemas', () => {
  it('accepts complete reports, including zero-byte entries and chunks', () => {
    const report = createReport({
      entries: { empty: 0 },
      chunks: { empty: 0 },
      largestAssets: [{ path: 'empty', bytes: 0 }],
    })

    expect(parseSizeReport(report)).toEqual(report)
    expect(parseSizePolicy(policy)).toEqual(policy)
  })

  it.each([0, -1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, Number.NaN])(
    'rejects invalid positive byte totals and asset count: %s',
    (value) => {
      for (const metric of [
        'zipBytes',
        'unpackedBytes',
        'javascriptBytes',
        'assetCount',
      ]) {
        const report = createReport()
        expect(() =>
          parseSizeReport({
            ...report,
            browsers: {
              ...report.browsers,
              chrome: { ...report.browsers.chrome, [metric]: value },
            },
          }),
        ).toThrow(ZodError)
      }
    },
  )

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Infinity, Number.NaN])(
    'rejects invalid per-file bytes: %s',
    (value) => {
      expect(() =>
        parseSizeReport(createReport({ entries: { invalid: value } })),
      ).toThrow(ZodError)
      expect(() =>
        parseSizeReport(createReport({ chunks: { invalid: value } })),
      ).toThrow(ZodError)
      expect(() =>
        parseSizeReport(
          createReport({ largestAssets: [{ path: 'invalid', bytes: value }] }),
        ),
      ).toThrow(ZodError)
    },
  )

  it.each([
    null,
    {},
    { ...createReport(), schemaVersion: 2 },
    { ...createReport(), revision: '' },
    { ...createReport(), environment: '' },
    { ...createReport(), environment: '   ' },
    { ...createReport(), extra: true },
    { ...createReport(), browsers: { chrome: createArtifact() } },
    { ...createReport(), browsers: { ...createReport().browsers, safari: {} } },
    {
      ...createReport(),
      browsers: {
        chrome: { ...createArtifact(), entries: undefined },
        firefox: createArtifact(),
      },
    },
    {
      ...createReport(),
      browsers: {
        chrome: { ...createArtifact(), extra: true },
        firefox: createArtifact(),
      },
    },
    createReport({ largestAssets: [{ path: '', bytes: 1 }] }),
  ])('rejects incomplete or malformed report input %#', (value) => {
    expect(() => parseSizeReport(value)).toThrow(ZodError)
  })

  it('accepts safe integer boundaries and explicit justified hard budgets', () => {
    expect(
      parseSizeReport(
        createReport({
          zipBytes: Number.MAX_SAFE_INTEGER,
          entries: { maximum: Number.MAX_SAFE_INTEGER },
        }),
      ).browsers.chrome.zipBytes,
    ).toBe(Number.MAX_SAFE_INTEGER)
    const budgetPolicy: SizePolicy = {
      ...policy,
      hardBudgets: [
        {
          browser: 'chrome',
          metric: 'zipBytes',
          maxBytes: Number.MAX_SAFE_INTEGER,
          reason: 'Measured store limit',
        },
      ],
    }
    expect(parseSizePolicy(budgetPolicy)).toEqual(budgetPolicy)
  })

  it.each([
    null,
    {},
    { ...policy, reportPercent: -1 },
    { ...policy, reportPercent: Infinity },
    { ...policy, reportPercent: Number.NaN },
    { ...policy, reviewPercent: Infinity },
    { ...policy, reviewPercent: Number.NaN },
    { ...policy, reviewPercent: 5 },
    { ...policy, reviewPercent: 4 },
    { ...policy, hardBudgets: undefined },
    { ...policy, extra: true },
  ])('rejects invalid policy input %#', (value) => {
    expect(() => parseSizePolicy(value)).toThrow(ZodError)
  })

  it.each([
    { browser: 'safari' },
    { metric: 'assetCount' },
    { maxBytes: 0 },
    { maxBytes: -1 },
    { maxBytes: 0.5 },
    { maxBytes: Number.MAX_SAFE_INTEGER + 1 },
    { reason: '' },
    { reason: '   ' },
    { extra: true },
  ])('rejects invalid hard budget %#', (invalid) => {
    expect(() =>
      parseSizePolicy({
        ...policy,
        hardBudgets: [
          {
            browser: 'chrome',
            metric: 'zipBytes',
            maxBytes: 1_000,
            reason: 'Measured limit',
            ...invalid,
          },
        ],
      }),
    ).toThrow(ZodError)
  })
})

describe('artifact size Markdown comparison', () => {
  it('separates informational chunk group counts from all assets and byte totals', () => {
    const baseline = createReport()
    const current = createReport(
      {
        assetCount: 11,
        chunks: {
          'chunks/OptionsRoute.js': 500,
          'chunks/other.js': 100,
          'chunks/split.js': 100,
        },
      },
      { assetCount: 11 },
    )
    const result = renderSizeReport(current, baseline, policy)

    expect(result).toContain(
      '| chrome | chunkGroupCount | 2 | 3 | +1 | informational |',
    )
    expect(result).toContain(
      '| firefox | chunkGroupCount | 2 | 2 | 0 | informational |',
    )
    for (const browser of ['chrome', 'firefox']) {
      expect(result).toContain(
        `| ${browser} | assetCount | 10 | 11 | +1 | informational |`,
      )
      expect(result).toContain(
        `| ${browser} | javascriptBytes | 3,000 B | 3,000 B | 0 B | 0.00% | unchanged |`,
      )
    }
    expect(result).toContain('正規化後のグループ数')
  })

  it('shows removed and empty chunk groups as informational counts', () => {
    const result = renderSizeReport(
      createReport({ chunks: {} }, { chunks: { 'chunks/retained.js': 700 } }),
      createReport({}, { chunks: {} }),
      policy,
    )

    expect(result).toContain(
      '| chrome | chunkGroupCount | 2 | 0 | -2 | informational |',
    )
    expect(result).toContain(
      '| firefox | chunkGroupCount | 0 | 1 | +1 | informational |',
    )
  })

  it('shows both browsers, metadata, total deltas and informational file count', () => {
    const baseline = { ...createReport(), revision: 'baseline-revision' }
    const result = renderSizeReport(
      createReport({ zipBytes: 1_060, assetCount: 12 }, { zipBytes: 1_110 }),
      baseline,
      policy,
    )

    expect(result).toContain('current-revision')
    expect(result).toContain('baseline-revision')
    expect(result).toContain('Linux x64; Node 22; Bun 1.3')
    expect(result).toContain(
      '| chrome | zipBytes | 1,000 B | 1,060 B | +60 B | +6.00% | report |',
    )
    expect(result).toContain(
      '| firefox | zipBytes | 1,000 B | 1,110 B | +110 B | +11.00% | review required |',
    )
    expect(result).toContain(
      '| chrome | assetCount | 10 | 12 | +2 | informational |',
    )
    expect(result).toContain('unpackedBytes')
    expect(result).toContain('javascriptBytes')
    expect(result).toContain('依存先')
    expect(result).toContain('redirect')
    expect(checkHardBudgets(createReport({ zipBytes: 2_000 }), policy)).toEqual(
      [],
    )
  })

  it.each([
    [1_050, 'within policy'],
    [1_051, 'report'],
    [1_100, 'report'],
    [1_101, 'review required'],
    [900, 'decreased'],
  ])(
    'uses strict advisory percentage boundaries at %s bytes',
    (bytes, status) => {
      const result = renderSizeReport(
        createReport({ zipBytes: bytes }),
        createReport(),
        policy,
      )
      const line = result
        .split('\n')
        .find((row) => row.startsWith('| chrome | zipBytes |'))
      expect(line).toContain(`| ${status} |`)
    },
  )

  it('compares added, removed and zero baseline groups without Infinity', () => {
    const baseline = createReport({
      entries: { removedEntry: 40 },
      chunks: { 'chunks/removed.js': 50, 'chunks/zero.js': 0 },
    })
    const current = createReport({
      entries: { addedEntry: 60 },
      chunks: { 'chunks/added.js': 70, 'chunks/zero.js': 100 },
    })
    const result = renderSizeReport(current, baseline, policy)

    expect(result).toContain('| addedEntry | — | 60 B | +60 B | N/A | added |')
    expect(result).toContain(
      '| removedEntry | 40 B | — | -40 B | -100.00% | removed |',
    )
    expect(result).toContain(
      '| chunks/added.js | — | 70 B | +70 B | N/A | added |',
    )
    expect(result).toContain(
      '| chunks/removed.js | 50 B | — | -50 B | -100.00% | removed |',
    )
    expect(result).toContain(
      '| chunks/zero.js | 0 B | 100 B | +100 B | N/A | review required |',
    )
    expect(result).not.toMatch(/Infinity|NaN/)
  })

  it('includes feature Route and Widget chunks and full groups under details', () => {
    const result = renderSizeReport(
      createReport({
        chunks: {
          'chunks/AiChatRoute.js': 450,
          'chunks/AnalyticsRoute.js': 400,
          'chunks/SavedTabsChatWidget.js': 300,
          'chunks/vendor.js': 200,
        },
      }),
      createReport(),
      policy,
    )
    const details = result.indexOf('<details>')
    expect(result.slice(0, details)).toContain('chunks/AiChatRoute.js')
    expect(result.slice(0, details)).toContain('chunks/AnalyticsRoute.js')
    expect(result.slice(0, details)).toContain('chunks/SavedTabsChatWidget.js')
    expect(result.slice(details)).toContain('chunks/vendor.js')
    expect(result).toContain('</details>')
  })

  it('sorts largest assets by bytes and limits each browser to ten', () => {
    const largestAssets = Array.from({ length: 12 }, (_, i) => ({
      path: `asset-${i}.png`,
      bytes: i + 1,
    }))
    const result = renderSizeReport(
      createReport({ largestAssets }),
      createReport(),
      policy,
    )
    expect(result).toContain('asset-11.png')
    expect(result).toContain('asset-2.png')
    expect(result).not.toContain('asset-1.png')
    expect(result).not.toContain('asset-0.png')
    expect(result.indexOf('asset-11.png')).toBeLessThan(
      result.indexOf('asset-2.png'),
    )
  })

  it('escapes metadata and filenames so input cannot inject Markdown or HTML', () => {
    const hostile = '[link](https://example.com)|`<script>\nnext'
    const current = {
      ...createReport({ entries: { [hostile]: 80 } }),
      revision: hostile,
      environment: hostile,
    }
    const result = renderSizeReport(current, createReport(), policy)

    expect(result).not.toContain(hostile)
    expect(result).not.toContain('<script>')
    expect(result).not.toContain('[link]')
    expect(result).toContain('&#124;')
    expect(result).toContain('&#96;')
    expect(result).toContain('&lt;script&gt;')
  })

  it('reports zero-to-zero as unchanged and lists an empty group explicitly', () => {
    const current = createReport({ chunks: { empty: 0 }, entries: {} })
    const result = renderSizeReport(current, current, policy)
    expect(result).toContain('| empty | 0 B | 0 B | 0 B | 0.00% | unchanged |')
    expect(result).toContain('該当なし')
  })

  it('does not mistake inherited object properties for existing file sizes', () => {
    const result = renderSizeReport(
      createReport({ entries: {} }),
      createReport({ entries: { constructor: 80 } }),
      policy,
    )
    expect(result).toContain(
      '| constructor | 80 B | — | -80 B | -100.00% | removed |',
    )
    expect(result).not.toMatch(/NaN|function Object/)
  })
})

describe('artifact size hard budgets', () => {
  const budgetPolicy: SizePolicy = {
    ...policy,
    hardBudgets: [
      {
        browser: 'chrome',
        metric: 'zipBytes',
        maxBytes: 1_000,
        reason: 'ZIP limit',
      },
      {
        browser: 'firefox',
        metric: 'javascriptBytes',
        maxBytes: 3_000,
        reason: 'JS limit',
      },
    ],
  }

  it('passes at the exact hard limit', () => {
    expect(checkHardBudgets(createReport(), budgetPolicy)).toEqual([])
  })

  it('returns every exceeded limit with browser, metric, actual, limit and reason', () => {
    const result = checkHardBudgets(
      createReport({ zipBytes: 1_001 }, { javascriptBytes: 3_001 }),
      budgetPolicy,
    )
    expect(result).toHaveLength(2)
    expect(result[0]).toContain('chrome')
    expect(result[0]).toContain('zipBytes')
    expect(result[0]).toContain('1,001 B')
    expect(result[0]).toContain('1,000 B')
    expect(result[0]).toContain('ZIP limit')
    expect(result[1]).toContain('firefox')
    expect(result[1]).toContain('javascriptBytes')
    expect(result[1]).toContain('JS limit')
  })
})
