import path from 'node:path'
import { parseArgs } from 'node:util'

import { evaluateIssues, loadManifest } from '#codex-issue-evaluation'
import { proveSandbox } from '#codex-issue-pressure'
import { z } from 'zod'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    run: { type: 'boolean', default: false },
    case: { type: 'string' },
    'opt-in': { type: 'boolean', default: false },
    output: { type: 'string', default: '.codex-issue-results' },
    model: { type: 'string', default: 'gpt-6.1-sol' },
    effort: { type: 'string', default: 'high' },
    seconds: { type: 'string', default: '300' },
    tokens: { type: 'string', default: '500000' },
    cadence: { type: 'string', default: 'change' },
  },
})
const root = path.resolve(import.meta.dirname, '../..')
const mode = positionals[0] ?? 'check'
function integer(value: string, min: number, max: number): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error('Evaluation budget is outside the supported range')
  }
  return parsed
}

try {
  if (positionals.length > 1) {
    throw new Error('Unexpected evaluation arguments')
  }
  if (mode === 'pressure') {
    const proof = await proveSandbox(root)
    console.log(JSON.stringify(proof))
  } else if (mode === 'check') {
    const manifest = loadManifest(root)
    console.log(
      `Codex issue contract: ${manifest.cases.length} pinned cases verified`,
    )
  } else {
    if (!['mock', 'baseline', 'real'].includes(mode)) {
      throw new Error('Unknown evaluation mode')
    }
    if (
      !['low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(
        values.effort,
      )
    ) {
      throw new Error('Unsupported effort')
    }
    if (!['change', 'weekly', 'monthly'].includes(values.cadence)) {
      throw new Error('Unsupported cadence')
    }
    const success = await evaluateIssues({
      root,
      mode: z.enum(['mock', 'baseline', 'real']).parse(mode),
      output: path.resolve(root, values.output),
      run: values.run,
      optIn: values['opt-in'],
      ...(values.case === undefined ? {} : { caseId: values.case }),
      model: values.model,
      effort: values.effort,
      seconds: integer(values.seconds, 10, 900),
      maxTokens: integer(values.tokens, 1000, 2000000),
      cadence: z.enum(['change', 'weekly', 'monthly']).parse(values.cadence),
    })
    console.log(
      `Codex issue evaluation: ${success ? 'passed' : 'failed or skipped'}; see results.json/results.md`,
    )
    if (!success) {
      process.exitCode = 1
    }
  }
} catch {
  console.error(
    'Codex issue evaluation could not complete; check the runbook and local prerequisites',
  )
  process.exitCode = 1
}
