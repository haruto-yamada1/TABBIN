import path from 'node:path'

import { syncAgentConfig } from './sync-agent-config.ts'

const projectRoot = path.resolve(import.meta.dirname, '..', '..')
const checkOnly = process.argv.includes('--check')
const result = syncAgentConfig({ checkOnly, projectRoot })

console.log(
  result.applied
    ? 'APM agent configuration synchronized after idempotent scratch verification.'
    : 'APM agent configuration scratch verification passed without changing the repository.',
)
