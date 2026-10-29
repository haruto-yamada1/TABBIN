import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

export type EvaluationReport = {
  mode: string
  status: string
  records: Record<string, unknown>[]
  configuration: Record<string, string | null>
  sandboxProof: Record<string, string> | null
  [key: string]: unknown
}

export function saveReport(
  output: string,
  report: { status: string; mode: string; records: Record<string, unknown>[] },
) {
  mkdirSync(output, { recursive: true, mode: 0o700 })
  writeFileSync(
    path.join(output, 'results.json'),
    `${JSON.stringify(report, null, 2)}\n`,
    { mode: 0o600 },
  )
  const rows = report.records.map((record) => {
    const columns = [
      'id',
      'status',
      'elapsedMs',
      'inputTokens',
      'cachedInputTokens',
      'outputTokens',
      'toolCalls',
      'retries',
    ]
    const cells = columns.map((column) => {
      const value = record[column]
      return typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : '-'
    })
    return `| ${cells.join(' | ')} |`
  })
  writeFileSync(
    path.join(output, 'results.md'),
    `# Codex issue evaluation\n\nMode: ${report.mode}; status: ${report.status}\n\n| Case | Status | ms | Input | Cached | Output | Tools | Retries |\n| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |\n${rows.join('\n')}\n`,
    { mode: 0o600 },
  )
}
