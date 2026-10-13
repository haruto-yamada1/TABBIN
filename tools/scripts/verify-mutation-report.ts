import { readFile } from 'node:fs/promises'

import { z } from 'zod'

const mutantSchema = z.object({
  status: z.enum([
    'Killed',
    'Survived',
    'NoCoverage',
    'Timeout',
    'Ignored',
    'RuntimeError',
    'CompileError',
    'Pending',
  ]),
  testsCompleted: z.number().int().nonnegative().optional(),
})

const mutationReportSchema = z.object({
  schemaVersion: z.literal('1.0'),
  files: z.record(
    z.string().min(1),
    z.object({ mutants: z.array(mutantSchema).min(1) }),
  ),
})

export type MutationReportSummary = {
  total: number
  killed: number
  survived: number
  noCoverage: number
  timeout: number
  ignored: number
}

const outcomeCountKeys: Record<
  z.infer<typeof mutantSchema>['status'],
  keyof Omit<MutationReportSummary, 'total'> | null
> = {
  Killed: 'killed',
  Survived: 'survived',
  NoCoverage: 'noCoverage',
  Timeout: 'timeout',
  Ignored: 'ignored',
  RuntimeError: null,
  CompileError: null,
  Pending: null,
}

function recordMutantOutcome(
  summary: MutationReportSummary,
  mutant: z.infer<typeof mutantSchema>,
): void {
  const countKey = outcomeCountKeys[mutant.status]
  if (countKey === null) {
    throw new Error('Mutation report contains failed mutant execution')
  }
  if (mutant.status === 'Survived' && !mutant.testsCompleted) {
    throw new Error('Survived mutants require at least one completed test')
  }
  summary[countKey] += 1
  summary.total += 1
}

export function verifyMutationReport(report: unknown): MutationReportSummary {
  const parsed = mutationReportSchema.safeParse(report)
  if (!parsed.success || Object.keys(parsed.data.files).length === 0) {
    throw new Error('Mutation report is missing, empty, or malformed')
  }

  const summary: MutationReportSummary = {
    total: 0,
    killed: 0,
    survived: 0,
    noCoverage: 0,
    timeout: 0,
    ignored: 0,
  }

  for (const file of Object.values(parsed.data.files)) {
    for (const mutant of file.mutants) {
      recordMutantOutcome(summary, mutant)
    }
  }
  return summary
}

export async function main(args: string[]): Promise<void> {
  const [reportPath] = args
  if (args.length !== 1 || !reportPath) {
    throw new Error(
      'Usage: bun tools/scripts/verify-mutation-report.ts <report.json>',
    )
  }
  const report: unknown = JSON.parse(await readFile(reportPath, 'utf8'))
  console.log(JSON.stringify(verifyMutationReport(report)))
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2))
  } catch {
    // Report source, replacements, paths, and status reasons stay private.
    console.error('Mutation report verification failed; report is invalid')
    process.exitCode = 1
  }
}
