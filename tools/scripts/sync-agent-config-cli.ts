import path from 'node:path'

import {
  parseAgentConfigCliArgs,
  syncAgentConfig,
} from './sync-agent-config.ts'

const projectRoot = path.resolve(import.meta.dirname, '..', '..')
const { checkOnly, repair } = parseAgentConfigCliArgs(process.argv)
const result = syncAgentConfig({ checkOnly, projectRoot, repair })

console.log(
  result.applied
    ? 'APM agent configuration synchronized after idempotent scratch verification.'
    : 'APM agent configuration scratch verification passed without changing the repository.',
)
