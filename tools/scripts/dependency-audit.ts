import { z } from 'zod'

const advisorySchema = z.object({
  id: z.number().int().positive(),
  url: z
    .string()
    .regex(
      /^https:\/\/github\.com\/advisories\/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/,
    ),
  title: z.string().min(1),
  severity: z.enum(['info', 'low', 'moderate', 'high', 'critical']),
  vulnerable_versions: z.string().min(1),
})
const reportSchema = z.record(
  z.string().regex(/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/),
  z.array(advisorySchema).min(1),
)

export function evaluateDependencyAudit(input: {
  stdout: string
  status: number | null
}) {
  if (input.status !== 0 && input.status !== 1) {
    throw new Error(
      `Dependency audit unavailable (exit ${String(input.status)})`,
    )
  }
  const report = reportSchema.parse(JSON.parse(input.stdout))
  const advisories = Object.entries(report).flatMap(([name, entries]) =>
    entries.map((entry) => ({ package: name, ...entry })),
  )
  if ((advisories.length === 0) !== (input.status === 0)) {
    throw new Error('Dependency audit report and exit status are inconsistent')
  }
  const blocking = advisories.filter(
    ({ severity }) => severity === 'high' || severity === 'critical',
  )
  return { advisories, accepted: [], blocking }
}
