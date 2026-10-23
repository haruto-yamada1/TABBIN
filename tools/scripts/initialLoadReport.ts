import { z } from 'zod'

import { comparisonTable, escapeCell } from './artifactSizeComparison'
import type { SizePolicy } from './artifactSizeComparison'

export const loadScenarios = {
  'saved-tabs': {
    route: 'app.html#/saved-tabs?mode=domain',
    ready:
      '[data-testid="saved-tabs-page-presentation"][data-loading="false"][data-error=""]',
  },
  options: { route: 'app.html#/options', ready: '#app h1' },
  'ai-chat': {
    route: 'app.html#/ai-chat',
    ready:
      '[data-testid="chat-widget-shell"] [data-testid="ai-chat-bottom-dock"]',
  },
  analytics: {
    route: 'app.html#/analytics',
    ready: '[data-testid="analytics-page-layout"]',
  },
} as const

const text = z.string().min(1)
const bytes = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const featureRecord = <Value extends z.ZodType>(value: Value) =>
  z.record(z.enum(['saved-tabs', 'options', 'ai-chat', 'analytics']), value)
const metadata = {
  schemaVersion: z.literal(1),
  scenario: z.literal('fresh-profile-empty-en-v1'),
  method: z.literal('parsed-module-sources-v1'),
  revision: z.string().regex(/^[a-f\d]{40}$/u),
  environment: text,
}
const observation = z.strictObject({
  artifactSha256: z.string().regex(/^[a-f\d]{64}$/u),
  browserVersion: text,
  features: featureRecord(z.array(text).min(1)),
})
const observationsSchema = z.strictObject({
  ...metadata,
  browsers: z.strictObject({ chrome: observation, firefox: observation }),
})
const sizes = z.strictObject({
  features: featureRecord(
    z.strictObject({
      javascriptBytes: bytes,
      sharedJavascriptBytes: bytes,
      files: z.array(z.strictObject({ path: text, bytes })).min(1),
    }),
  ),
  uniqueJavascriptBytes: bytes,
  sharedJavascriptBytes: bytes,
})
const reportSchema = z.strictObject({
  ...metadata,
  browsers: z.strictObject({
    chrome: z.strictObject({
      browserVersion: text,
      artifactSha256: text,
      sizes,
    }),
    firefox: z.strictObject({
      browserVersion: text,
      artifactSha256: text,
      sizes,
    }),
  }),
})
export type LoadObservations = z.infer<typeof observationsSchema>
export type InitialLoadReport = z.infer<typeof reportSchema>
export const parseLoadObservations = (input: unknown): LoadObservations =>
  observationsSchema.parse(input)
export const parseInitialLoadReport = (input: unknown): InitialLoadReport =>
  reportSchema.parse(input)

export const assertLoadProvenance = (
  observations: LoadObservations,
  revision: string,
  fingerprints: Record<'chrome' | 'firefox', string>,
): void => {
  if (observations.revision !== revision) {
    throw new Error(
      'Initial-load observations belong to another revision; run size:loads again',
    )
  }
  for (const browser of ['chrome', 'firefox'] as const) {
    if (
      observations.browsers[browser].artifactSha256 !== fingerprints[browser]
    ) {
      throw new Error(
        `Stale ${browser} initial-load observations; run size:loads again`,
      )
    }
  }
}

export const renderInitialLoadReport = (
  current: InitialLoadReport,
  baseline: InitialLoadReport,
  policy: SizePolicy,
): string => {
  const sections = [
    '# Feature initial JavaScript loads',
    `Scenario: ${current.scenario}. Current: ${current.revision}; baseline: ${baseline.revision}.`,
    `Current environment: ${escapeCell(current.environment)}. Baseline environment: ${escapeCell(baseline.environment)}.`,
    'Packaged JS source bytes observed by each browser debugger before interaction. Each physical file is counted once per screen. Shared bytes are included in screen totals; do not add them again or sum screens. Unique union counts each file once across all screens. This is parse-input volume, not parse CPU time or HTTP transferSize.',
  ]
  for (const browser of ['chrome', 'firefox'] as const) {
    const next = current.browsers[browser]
    const previous = baseline.browsers[browser]
    const metrics = (value: typeof next): Record<string, number> =>
      Object.fromEntries([
        ...Object.entries(value.sizes.features).map(
          ([feature, load]) => [feature, load.javascriptBytes] as const,
        ),
        ['Unique union (all screens)', value.sizes.uniqueJavascriptBytes],
        ['Shared subset (all screens)', value.sizes.sharedJavascriptBytes],
      ])
    sections.push(
      `## ${browser} (${escapeCell(next.browserVersion)}; baseline ${escapeCell(previous.browserVersion)})`,
      comparisonTable(metrics(next), metrics(previous), policy),
      `| Screen | Shared subset included in current | Unique JS files |\n| --- | ---: | ---: |\n${Object.entries(
        next.sizes.features,
      )
        .map(
          ([feature, load]) =>
            `| ${feature} | ${load.sharedJavascriptBytes.toLocaleString('en-US')} B | ${load.files.length} |`,
        )
        .join('\n')}`,
    )
  }
  return `${sections.join('\n\n')}\n`
}

// Same browser-side readiness boundary for both engines.
// No user interaction, synthetic app build, or arbitrary screenshot delay.
export const initialLoadReadyScript = `
  return document.readyState === 'complete' && document.documentElement.lang === 'en' && Boolean(document.querySelector(arguments[0]));
`
