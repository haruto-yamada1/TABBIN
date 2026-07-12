#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import process from 'node:process'

const args = process.argv.slice(2)

/**
 * @param {string} name
 * @returns {string | undefined}
 */
function findArg(name) {
  const idx = args.indexOf(name)
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1]
  }
  return undefined
}

const repeatRaw = findArg('--repeat') ?? '10'
const repeat = Math.trunc(Number(repeatRaw))
const configArg = findArg('--config') ?? 'vitest.ci.config.ts'
const projectOverride = findArg('--project')

const reserved = new Set(['--repeat', '--config', '--project'])
const positional = args.filter((arg, idx) => {
  const prev = args[idx - 1]
  return !reserved.has(arg) && !reserved.has(prev)
})

if (positional.length === 0 || Number.isNaN(repeat) || repeat <= 0) {
  console.error(
    'Usage: bun tools/scripts/test-flake.mjs -- <file> --repeat <n> [--project <dom|node>]',
  )
  process.exit(1)
}

const file = positional[0]
const project = projectOverride ?? (file.endsWith('.test.tsx') ? 'dom' : 'node')

console.log(
  `Running ${file} ${repeat} times (project: ${project}, config: ${configArg})...`,
)

let pass = 0
let fail = 0
const failureDetails = []

const SUMMARY_CONTEXT_LINES = 30
const FALLBACK_TAIL_LINES = 40

for (let i = 1; i <= repeat; i++) {
  const vitestArgs = [
    'vitest',
    'run',
    file,
    '--config',
    configArg,
    '--project',
    project,
  ]

  const result = spawnSync('bunx', vitestArgs, {
    stdio: 'pipe',
    cwd: process.cwd(),
    env: process.env,
  })

  const status = result.status ?? 1
  const output = `${result.stdout.toString('utf8')}\n${result.stderr.toString('utf8')}`

  if (status === 0) {
    pass++
    console.log(`Run ${i}/${repeat}: PASS`)
  } else {
    fail++
    console.log(`Run ${i}/${repeat}: FAIL`)
    const lines = output.split('\n')
    const failuresStart = lines.findIndex((line) => line.includes('FAILURES'))
    const summary =
      failuresStart >= 0
        ? lines
            .slice(failuresStart, failuresStart + SUMMARY_CONTEXT_LINES)
            .join('\n')
        : lines.slice(-FALLBACK_TAIL_LINES).join('\n')
    failureDetails.push(`=== Run ${i} ===\n${summary.trim()}`)
  }
}

console.log('\n=== Summary ===')
console.log(`Total: ${repeat}, Pass: ${pass}, Fail: ${fail}`)

if (failureDetails.length > 0) {
  console.log(`\n${failureDetails.join('\n\n')}`)
  process.exit(1)
}
