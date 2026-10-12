import path from 'node:path'

import { z } from 'zod'

const relativePath = z
  .string()
  .refine(
    (value) =>
      value.length > 0 &&
      !path.isAbsolute(value) &&
      !value.includes('\\') &&
      !value
        .split('/')
        .some((part) => !part || part === '.' || part === '..') &&
      /^[\w./-]+$/u.test(value),
    'Expected a normalized relative path',
  )
const productionPath = relativePath.refine(
  (value) =>
    [
      'package.json',
      'wxt.config.ts',
      'tools/scripts/firefoxArtifactContract.ts',
    ].includes(value) ||
    (value.startsWith('src/') && !/\.(?:test|spec)\./u.test(value)),
  'Only production sources and guarded package imports may change',
)
const caseSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]{1,63}$/u),
    issue: z.number().int().positive(),
    startCommit: z.string().regex(/^[a-f0-9]{40}$/u),
    prompt: z.string().min(10),
    allowedPaths: z.array(productionPath).min(1).max(20),
    hiddenTest: relativePath,
    hiddenTestTarget: relativePath.refine((value) =>
      /^src\/.*\.test\.tsx?$/u.test(value),
    ),
    project: z.enum(['node', 'dom']),
    referencePatch: relativePath,
    additionalHiddenTests: z
      .array(
        z
          .object({
            hiddenTest: relativePath,
            hiddenTestTarget: relativePath.refine((value) =>
              /^src\/.*\.test\.tsx?$/u.test(value),
            ),
          })
          .strict(),
      )
      .max(5)
      .optional(),
    regressionTests: z.array(relativePath).min(1).max(20),
    expectedHiddenTests: z.number().int().positive(),
    expectedRegressionTests: z.number().int().positive(),
  })
  .strict()
const manifestSchema = z
  .object({ version: z.literal(1), cases: z.array(caseSchema).min(3).max(5) })
  .strict()
  .superRefine((manifest, context) => {
    for (const key of ['id', 'issue'] as const) {
      if (
        new Set(manifest.cases.map((item) => item[key])).size !==
        manifest.cases.length
      ) {
        context.addIssue({ code: 'custom', message: `Duplicate case ${key}` })
      }
    }
    for (const item of manifest.cases) {
      if (new Set(item.allowedPaths).size !== item.allowedPaths.length) {
        context.addIssue({ code: 'custom', message: 'Duplicate allowed path' })
      }
    }
  })
export type IssueCase = z.infer<typeof caseSchema>
export function validateManifest(value: unknown) {
  return manifestSchema.parse(value)
}

type DecisionInput = {
  completed: boolean
  timedOut: boolean
  outputLimit: boolean
  exitCode: number | null
  invalidEvents: boolean
  inputTokens: number | null
  outputTokens: number | null
  withinScope: boolean
  gates: boolean[]
  maxTokens: number
}
export function decideResult(value: DecisionInput): string {
  if (value.timedOut) {
    return 'timeout'
  }
  if (value.outputLimit) {
    return 'output_limit'
  }
  if (
    value.inputTokens === null ||
    value.outputTokens === null ||
    value.inputTokens === 0 ||
    value.outputTokens === 0
  ) {
    return 'usage_unavailable'
  }
  if (value.exitCode !== 0 || !value.completed || value.invalidEvents) {
    return 'agent_failed'
  }
  if (value.inputTokens + value.outputTokens > value.maxTokens) {
    return 'budget_exceeded'
  }
  if (!value.withinScope) {
    return 'scope_violation'
  }
  if (value.gates.length !== 4 || !value.gates.every(Boolean)) {
    return 'grading_failed'
  }
  return 'passed'
}
