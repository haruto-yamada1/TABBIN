import { appendFileSync } from 'node:fs'

import { inspectEvidence } from './telemetry-files'

const directory = process.argv[2]
if (!directory) {
  throw new Error('Usage: check-flake-evidence.ts <directory>')
}
const result = inspectEvidence(directory)
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `available=${String(result.available)}\n`,
  )
}
console.log(JSON.stringify(result))
