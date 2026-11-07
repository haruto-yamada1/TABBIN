import { academyManifest } from '#academy-fixture'
import { z } from 'zod'

const text = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .refine(
    (value) =>
      Array.from(value).every(
        (character) =>
          (character.codePointAt(0) ?? 0) >= 32 &&
          character !== '<' &&
          character !== '>',
      ),
    'Text must not contain control characters or VTT markup.',
  )
const localized = z.strictObject({ ja: text, en: text })
const hostname = z.enum(academyManifest.sites.map((site) => site.hostname))
const seconds = z.number().positive().max(45)
const start = z.number().nonnegative().max(45)
const zoom = z.number().min(1).max(1.3)

const action = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('assert-urls'), count: z.literal(6) }),
  z.strictObject({
    type: z.literal('assert-domains'),
    hostnames: z.array(hostname).length(3),
  }),
  z.strictObject({
    type: z.literal('focus-domain'),
    hostname,
    holdSeconds: seconds,
  }),
])
const segment = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('card'),
    seconds,
    title: localized,
    detail: localized,
  }),
  z.strictObject({
    kind: z.literal('native'),
    stage: z.enum(['install', 'pin', 'save']),
    start,
    seconds,
    zoom,
  }),
  z.strictObject({ kind: z.literal('page'), start, seconds, zoom }),
])

const scenarioSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z][a-z0-9-]{0,60}$/u),
    lessonId: z.string().regex(/^[a-z][a-z0-9-]{0,60}$/u),
    version: z.number().int().positive(),
    prerequisites: z.array(z.number().int().positive()).min(1),
    viewport: z.strictObject({
      width: z.literal(1280),
      height: z.literal(720),
    }),
    browserVersion: z.string().regex(/^\d+\.\d+\.\d+\.\d+$/u),
    demoSeed: z.literal(academyManifest.seed),
    actions: z.array(action).min(3).max(30),
    assertions: z.strictObject({ urls: z.literal(6), domains: z.literal(3) }),
    segments: z.array(segment).min(3).max(20),
    captions: z
      .array(z.strictObject({ start, end: seconds, ja: text, en: text }))
      .min(1),
    output: z.strictObject({
      filename: z.string().regex(/^[a-z][a-z0-9-]*\.mp4$/u),
      fps: z.literal(30),
      maxBytes: z.number().int().positive().max(50000000),
    }),
  })
  .superRefine((scenario, ctx) => {
    const duration = scenario.segments.reduce(
      (sum, item) => sum + item.seconds,
      0,
    )
    const invalid = (message: string) => {
      ctx.addIssue({ code: 'custom', message })
    }
    if (duration < 15 || duration > 45) {
      invalid('Lesson must last 15–45 seconds.')
    }
    if (
      scenario.segments[0]?.kind !== 'card' ||
      scenario.segments.at(-1)?.kind !== 'card'
    ) {
      invalid('Opening and ending cards are required.')
    }
    if (
      !scenario.segments.some(
        (item) => item.kind === 'native' && item.stage === 'save',
      ) ||
      !scenario.segments.some((item) => item.kind === 'page')
    ) {
      invalid('A native save clip and a real page continuation are required.')
    }
    const holds = scenario.actions.reduce(
      (sum, item) =>
        sum + (item.type === 'focus-domain' ? item.holdSeconds : 0),
      0,
    )
    for (const item of scenario.segments) {
      if (item.kind === 'page' && item.start + item.seconds > holds) {
        invalid('Page segment exceeds the planned recorded presentation.')
      }
    }
  })
  .superRefine((scenario, ctx) => {
    const duration = scenario.segments.reduce(
      (sum, item) => sum + item.seconds,
      0,
    )
    const invalid = (message: string) => {
      ctx.addIssue({ code: 'custom', message })
    }
    let lastEnd = 0
    for (const cue of scenario.captions) {
      if (cue.start < lastEnd || cue.end <= cue.start || cue.end > duration) {
        invalid(
          'Captions must be ordered, nonoverlapping and inside the timeline.',
        )
      }
      lastEnd = cue.end
    }
  })

export type LessonScenario = z.output<typeof scenarioSchema>
export type Locale = 'ja' | 'en'
export const parseScenario = (value: unknown): LessonScenario =>
  scenarioSchema.parse(value)
