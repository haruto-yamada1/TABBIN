import { z } from 'zod'

const nonnegativeInteger = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER)
const positiveInteger = nonnegativeInteger.min(1)
const nonemptyText = z.string().refine((value) => value.trim().length > 0)

const artifactSchema = z.strictObject({
  zipBytes: positiveInteger,
  unpackedBytes: positiveInteger,
  javascriptBytes: positiveInteger,
  assetCount: positiveInteger,
  entries: z.record(z.string(), nonnegativeInteger),
  chunks: z.record(z.string(), nonnegativeInteger),
  largestAssets: z.array(
    z.strictObject({ path: nonemptyText, bytes: nonnegativeInteger }),
  ),
})

const reportSchema = z.strictObject({
  schemaVersion: z.literal(1),
  revision: nonemptyText,
  environment: nonemptyText,
  browsers: z.strictObject({ chrome: artifactSchema, firefox: artifactSchema }),
})

const policySchema = z
  .strictObject({
    reportPercent: z.number().nonnegative(),
    reviewPercent: z.number().nonnegative(),
    hardBudgets: z.array(
      z.strictObject({
        browser: z.enum(['chrome', 'firefox']),
        metric: z.enum(['zipBytes', 'unpackedBytes', 'javascriptBytes']),
        maxBytes: positiveInteger,
        reason: nonemptyText,
      }),
    ),
  })
  .refine((value) => value.reviewPercent > value.reportPercent, {
    message: 'reviewPercent must be greater than reportPercent',
    path: ['reviewPercent'],
  })

export type SizeArtifact = z.infer<typeof artifactSchema>
export type SizeReport = z.infer<typeof reportSchema>
export type SizePolicy = z.infer<typeof policySchema>

export const parseSizeReport = (value: unknown): SizeReport =>
  reportSchema.parse(value)

export const parseSizePolicy = (value: unknown): SizePolicy =>
  policySchema.parse(value)

const escapeCell = (value: string): string =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('|', '&#124;')
    .replaceAll('`', '&#96;')
    .replaceAll('[', '&#91;')
    .replaceAll(']', '&#93;')
    .replaceAll('\\', '&#92;')
    .replaceAll('*', '&#42;')
    .replaceAll('_', '&#95;')
    .replaceAll('~', '&#126;')
    .replace(/[\r\n]+/g, ' ')

const formatNumber = (value: number): string => value.toLocaleString('en-US')
const formatBytes = (value: number): string => `${formatNumber(value)} B`
const formatDelta = (value: number): string =>
  `${value > 0 ? '+' : ''}${formatNumber(value)}`

const advisoryStatus = (
  delta: number,
  percent: number | null,
  policy: SizePolicy,
): string => {
  if (delta === 0) {
    return 'unchanged'
  }
  if (delta < 0) {
    return 'decreased'
  }
  if (percent === null || percent > policy.reviewPercent) {
    return 'review required'
  }
  if (percent > policy.reportPercent) {
    return 'report'
  }
  return 'within policy'
}

const comparisonCells = (
  current: number | undefined,
  baseline: number | undefined,
  policy: SizePolicy,
): string[] => {
  const delta = (current ?? 0) - (baseline ?? 0)
  let percent: number | null = null
  if (baseline !== undefined && baseline > 0) {
    percent = (delta / baseline) * 100
  } else if (baseline === 0 && delta === 0) {
    percent = 0
  }
  let status = advisoryStatus(delta, percent, policy)
  if (baseline === undefined) {
    status = 'added'
  } else if (current === undefined) {
    status = 'removed'
  }
  return [
    baseline === undefined ? '—' : formatBytes(baseline),
    current === undefined ? '—' : formatBytes(current),
    `${formatDelta(delta)} B`,
    percent === null
      ? 'N/A'
      : `${percent > 0 ? '+' : ''}${percent.toFixed(2)}%`,
    status,
  ]
}

const table = (headers: string[], rows: string[][]): string =>
  [headers, headers.map(() => '---'), ...rows]
    .map((cells) => `| ${cells.join(' | ')} |`)
    .join('\n')

const comparisonTable = (
  current: Record<string, number>,
  baseline: Record<string, number>,
  policy: SizePolicy,
): string => {
  const names = [
    ...new Set([...Object.keys(current), ...Object.keys(baseline)]),
  ].toSorted()
  if (names.length === 0) {
    return '該当なし。'
  }
  return table(
    ['Path / group', 'Baseline', 'Current', 'Delta', 'Delta %', 'Status'],
    names.map((name) => [
      escapeCell(name),
      ...comparisonCells(
        Object.hasOwn(current, name) ? current[name] : undefined,
        Object.hasOwn(baseline, name) ? baseline[name] : undefined,
        policy,
      ),
    ]),
  )
}

const featureChunks = (
  chunks: Record<string, number>,
): Record<string, number> =>
  Object.fromEntries(
    Object.entries(chunks).filter(([name]) =>
      /(?:Route|Widget)\.[cm]?js$/.test(name),
    ),
  )

const browserTotals = (
  current: SizeReport,
  baseline: SizeReport,
  policy: SizePolicy,
): string => {
  const rows: string[][] = []
  for (const browser of ['chrome', 'firefox'] as const) {
    for (const metric of [
      'zipBytes',
      'unpackedBytes',
      'javascriptBytes',
    ] as const) {
      rows.push([
        browser,
        metric,
        ...comparisonCells(
          current.browsers[browser][metric],
          baseline.browsers[browser][metric],
          policy,
        ),
      ])
    }
  }
  return table(
    ['Browser', 'Metric', 'Baseline', 'Current', 'Delta', 'Delta %', 'Status'],
    rows,
  )
}

const artifactCounts = (current: SizeReport, baseline: SizeReport): string =>
  table(
    ['Browser', 'Metric', 'Baseline', 'Current', 'Delta', 'Status'],
    (['chrome', 'firefox'] as const).flatMap((browser) => {
      const previous = baseline.browsers[browser]
      const next = current.browsers[browser]
      const counts = {
        assetCount: [previous.assetCount, next.assetCount],
        chunkGroupCount: [
          Object.keys(previous.chunks).length,
          Object.keys(next.chunks).length,
        ],
      }
      return Object.entries(counts).map(([metric, [before, after]]) => [
        browser,
        metric,
        formatNumber(before),
        formatNumber(after),
        formatDelta(after - before),
        'informational',
      ])
    }),
  )

const largestAssetTable = (artifact: SizeArtifact): string =>
  table(
    ['Path', 'Current'],
    [...artifact.largestAssets]
      .toSorted((a, b) => b.bytes - a.bytes || (a.path < b.path ? -1 : 1))
      .slice(0, 10)
      .map((asset) => [escapeCell(asset.path), formatBytes(asset.bytes)]),
  )

const browserDetails = (
  browser: 'chrome' | 'firefox',
  current: SizeArtifact,
  baseline: SizeArtifact,
  policy: SizePolicy,
): string =>
  [
    `## ${browser}`,
    '### Entries',
    comparisonTable(current.entries, baseline.entries, policy),
    '### Feature Route / Widget chunks',
    comparisonTable(
      featureChunks(current.chunks),
      featureChunks(baseline.chunks),
      policy,
    ),
    '### Largest 10 assets',
    largestAssetTable(current),
    '<details>\n<summary>All chunk groups</summary>',
    comparisonTable(current.chunks, baseline.chunks, policy),
    '</details>',
  ].join('\n\n')

const budgetDescription = (policy: SizePolicy): string =>
  policy.hardBudgets.length === 0
    ? 'Hard budget: 未設定。advisory の増加だけでは CI を失敗させません。'
    : table(
        ['Browser', 'Metric', 'Hard limit', 'Reason'],
        policy.hardBudgets.map((budget) => [
          budget.browser,
          budget.metric,
          formatBytes(budget.maxBytes),
          escapeCell(budget.reason),
        ]),
      )

export const renderSizeReport = (
  current: SizeReport,
  baseline: SizeReport,
  policy: SizePolicy,
): string =>
  [
    '# Extension artifact size report',
    `- Current revision: ${escapeCell(current.revision)}\n- Current environment: ${escapeCell(current.environment)}\n- Baseline revision: ${escapeCell(baseline.revision)}\n- Baseline environment: ${escapeCell(baseline.environment)}`,
    `増加率 > ${policy.reportPercent}%: report、> ${policy.reviewPercent}%: review required。added / removed は新規・削除 group、N/A は比較元が存在しないか 0 B のため増加率を計算できない場合です。`,
    budgetDescription(policy),
    'ZIP は配布ファイルの実サイズです。unpackedBytes / javascriptBytes は展開後の raw bytes で、gzip / brotli の推計値ではありません。',
    'Entries は entry ファイル単体で、依存先の bytes を含みません。options / saved-tabs / ai-chat は小さな redirect entry の場合があるため、Feature Route / Widget chunks と併せて確認してください。',
    '## Browser totals',
    browserTotals(current, baseline, policy),
    'assetCount は全ファイル数、chunkGroupCount は JavaScript の正規化後のグループ数です。同名に正規化される複数ファイルは 1 group と数えるため、JavaScript の実ファイル数とは異なります。件数の増減は情報表示のみです。',
    artifactCounts(current, baseline),
    ...(['chrome', 'firefox'] as const).map((browser) =>
      browserDetails(
        browser,
        current.browsers[browser],
        baseline.browsers[browser],
        policy,
      ),
    ),
    '',
  ].join('\n\n')

export const checkHardBudgets = (
  report: SizeReport,
  policy: SizePolicy,
): string[] =>
  policy.hardBudgets.flatMap((budget) => {
    const actual = report.browsers[budget.browser][budget.metric]
    return actual > budget.maxBytes
      ? [
          `${budget.browser} ${budget.metric}: ${formatBytes(actual)} exceeds ${formatBytes(budget.maxBytes)} (${budget.reason})`,
        ]
      : []
  })
