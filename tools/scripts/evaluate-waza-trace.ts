#!/usr/bin/env bun
/**
 * tools/scripts/evaluate-waza-trace.ts
 *
 * Issue #799 Step 4 — Waza session/transcript → EvalTrace → evaluateTrace CLI.
 *
 * Waza real-model eval (Layer 3) の結果 (results.json + transcript-dir) を読み込み、
 * trace adapter で EvalTrace へ変換し、trace evaluator で採点する。
 * trace violation があれば非ゼロ終了する。
 *
 * Usage:
 *   bun tools/scripts/evaluate-waza-trace.ts \
 *     --results .waza-results/github-pr-review-real-results.json \
 *     --transcript-dir .waza-results/transcripts \
 *     --intent read-only \
 *     --output .waza-results/trace-evaluation.json
 *
 * Exit codes:
 *   0 — all traces passed (no violations)
 *   1 — one or more traces have violations
 *   2 — configuration / infrastructure error
 */

import { writeFileSync, mkdirSync } from 'node:fs'

import { adaptWazaToTraces } from './waza-trace-adapter'
import { evaluateTrace } from './waza-trace-evaluator'
import type { TraceEvaluation, EvalTrace } from './waza-trace-evaluator'

type CLIOptions = {
  resultsPath: string
  transcriptDir?: string
  intent: 'read-only' | 'side-effect'
  outputPath?: string
}

const printUsage = (): void => {
  const lines = [
    'Usage: bun tools/scripts/evaluate-waza-trace.ts <options>',
    '',
    'Required:',
    '  --results <path>          Waza results.json path',
    '  --intent <read-only|side-effect>  Request intent for trace evaluation',
    '',
    'Optional:',
    '  --transcript-dir <path>   Directory with per-task transcript JSON files',
    '  --output <path>           Write evaluation JSON to this path',
  ]
  for (const line of lines) {
    console.error(line)
  }
}

const parseArgs = (argv: readonly string[]): CLIOptions | null => {
  let resultsPath: string | undefined
  let transcriptDir: string | undefined
  let intent: string | undefined
  let outputPath: string | undefined

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    switch (arg) {
      case '--results': {
        resultsPath = argv[++i]
        break
      }
      case '--transcript-dir': {
        transcriptDir = argv[++i]
        break
      }
      case '--intent': {
        intent = argv[++i]
        break
      }
      case '--output': {
        outputPath = argv[++i]
        break
      }
      case '--help':
      case '-h': {
        printUsage()
        return null
      }
      default: {
        console.error(`Unknown argument: ${arg}`)
        printUsage()
        return null
      }
    }
  }

  if (!resultsPath) {
    console.error('Missing required --results')
    printUsage()
    return null
  }
  if (!intent || (intent !== 'read-only' && intent !== 'side-effect')) {
    console.error(
      'Missing or invalid --intent (must be "read-only" or "side-effect")',
    )
    printUsage()
    return null
  }

  return {
    resultsPath,
    transcriptDir,
    intent,
    outputPath,
  }
}

type TaskEvaluation = {
  readonly task_index: number
  readonly final_output: string
  readonly tool_invocation_count: number
  readonly evaluation: TraceEvaluation
}

type EvaluationReport = {
  readonly task_count: number
  readonly passed: boolean
  readonly task_evaluations: readonly TaskEvaluation[]
  readonly intent: string
}

const main = (): void => {
  const options = parseArgs(process.argv.slice(2))
  if (options === null) {
    process.exit(2)
  }

  let adapterResult
  try {
    adapterResult = adaptWazaToTraces({
      resultsPath: options.resultsPath,
      transcriptDir: options.transcriptDir,
      requestIntent: options.intent,
    })
  } catch (error) {
    console.error(
      `trace-adapter error: ${error instanceof Error ? error.message : String(error)}`,
    )
    process.exit(2)
  }

  const taskEvaluations: TaskEvaluation[] = []

  adapterResult.traces.forEach((trace: EvalTrace, index: number) => {
    const evaluation = evaluateTrace(trace)
    taskEvaluations.push({
      task_index: index,
      final_output: trace.final_output.slice(0, 200),
      tool_invocation_count: trace.tool_invocations.length,
      evaluation,
    })
  })

  const failedCount = taskEvaluations.filter(
    (te) => !te.evaluation.passed,
  ).length
  const allPassed = failedCount === 0

  const report: EvaluationReport = {
    task_count: adapterResult.taskCount,
    passed: allPassed,
    intent: options.intent,
    task_evaluations: taskEvaluations,
  }

  // print summary to stdout
  console.log(
    `Trace evaluation: ${adapterResult.taskCount} task(s), intent=${options.intent}`,
  )
  for (const te of taskEvaluations) {
    const status = te.evaluation.passed ? 'PASS' : 'FAIL'
    console.log(
      `  [${status}] task #${te.task_index}: ${te.tool_invocation_count} tool(s), ${te.evaluation.violations.length} violation(s)`,
    )
    for (const v of te.evaluation.violations) {
      console.log(`    ${v.category}: ${v.detail}`)
    }
  }
  console.log(`Overall: ${allPassed ? 'PASS' : 'FAIL'}`)

  // write output if requested
  if (options.outputPath) {
    const outputDir = options.outputPath.substring(
      0,
      options.outputPath.lastIndexOf('/'),
    )
    if (outputDir) {
      mkdirSync(outputDir, { recursive: true })
    }
    writeFileSync(options.outputPath, JSON.stringify(report, null, 2))
    console.log(`Written: ${options.outputPath}`)
  }

  process.exit(allPassed ? 0 : 1)
}

main()
