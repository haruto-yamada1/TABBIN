import { appendFileSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import type { JsonReportSummary } from 'react-doctor/api'
import { z } from 'zod'

const scoreSchema = z.number().int().min(0).max(100) satisfies z.ZodType<
  NonNullable<JsonReportSummary['score']>
>
const diagnosticSchema = z.object({
  filePath: z.string().max(2048),
  line: z.number().int().min(0),
  plugin: z.string().max(100),
  rule: z.string().max(100),
  message: z.string().max(4000),
  severity: z.enum(['error', 'warning']),
  help: z.string().max(4000).optional(),
})
const reportSchema = z.object({
  ok: z.literal(true),
  mode: z.literal('full'),
  error: z.null(),
  reactDetected: z.literal(true),
  summary: z.object({
    score: scoreSchema,
    errorCount: z.number().int().min(0),
    warningCount: z.number().int().min(0),
  }),
  projects: z
    .array(
      z.object({
        complete: z.literal(true),
        score: z.object({ score: scoreSchema }),
        skippedChecks: z.array(z.unknown()).length(0),
      }),
    )
    .min(1),
  diagnostics: z.array(diagnosticSchema).max(10000),
})

function projectPath(file: string, root: string): string | undefined {
  const normalized = file.replaceAll('\\', '/')
  if (!normalized || normalized.includes('\0') || /^[a-z]:/i.test(normalized)) {
    return undefined
  }
  const relative = path
    .relative(root, path.resolve(root, normalized))
    .split(path.sep)
    .join('/')
  return relative &&
    !relative.split('/').some((part) => part === '..') &&
    !path.isAbsolute(relative)
    ? relative
    : undefined
}

export function parseDoctorReport(value: unknown, root = process.cwd()) {
  const report = reportSchema.parse(value)
  return {
    score: Math.min(
      report.summary.score,
      ...report.projects.map((project) => project.score.score),
    ),
    errorCount: report.summary.errorCount,
    warningCount: report.summary.warningCount,
    diagnostics: report.diagnostics
      .slice(0, 50)
      .map(({ filePath, ...diagnostic }) => ({
        ...diagnostic,
        path: projectPath(filePath, root),
      })),
  }
}

export function publishDoctorReport(
  value: unknown,
  options: {
    root?: string
    outputFile?: string | undefined
    summaryFile?: string | undefined
  } = {},
) {
  const review = parseDoctorReport(value, options.root)
  // GitHub job outputs have a UTF-16 size limit. Keep the optional PR payload
  // small without changing the scan's score or total diagnostic counts.
  while (review.diagnostics.length && JSON.stringify(review).length > 60000) {
    review.diagnostics.pop()
  }
  if (options.outputFile) {
    appendFileSync(
      options.outputFile,
      `score=${review.score}\nreview=${JSON.stringify(review)}\n`,
    )
  }
  if (options.summaryFile) {
    appendFileSync(
      options.summaryFile,
      `## React Doctor\n\nScore: **${review.score}/100**\n\nErrors: ${review.errorCount}; warnings: ${review.warningCount}.\n`,
    )
  }
  return review
}

if (import.meta.main) {
  const file = process.argv[2]
  try {
    if (!file || statSync(file).size > 8 * 1024 * 1024) {
      throw new Error('Missing or oversized React Doctor report')
    }
    publishDoctorReport(JSON.parse(readFileSync(file, 'utf8')), {
      outputFile: process.env.GITHUB_OUTPUT,
      summaryFile: process.env.GITHUB_STEP_SUMMARY,
    })
  } catch (error) {
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        'review={"score":null,"errorCount":0,"warningCount":0,"diagnostics":[]}\n',
      )
    }
    throw error
  }
}
