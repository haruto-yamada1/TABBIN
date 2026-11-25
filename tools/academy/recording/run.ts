import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'

import { startRecordingSession } from './session'

const { values } = parseArgs({
  options: {
    source: { type: 'string', default: 'unpacked-development' },
    browser: { type: 'string' },
  },
  strict: true,
})
if (
  values.source !== 'chrome-web-store' &&
  values.source !== 'unpacked-development'
) {
  throw new Error('--source must be chrome-web-store or unpacked-development.')
}
if (
  values.browser !== undefined &&
  values.browser !== 'chrome' &&
  values.browser !== 'chromium'
) {
  throw new Error('--browser must be chrome or chromium.')
}
const session = await startRecordingSession(values.source, values.browser)
const terminal = createInterface({
  input: process.stdin,
  output: process.stdout,
})
try {
  for await (const line of terminal) {
    try {
      await session.command(line.trim())
      console.log(
        JSON.stringify({ stage: session.stage, runDir: session.runDir }),
      )
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      console.log(
        'Failure evidence was retained. Correct the isolated scene and retry the same command, or enter abort.',
      )
    }
    if (session.stage === 'finished' || session.stage === 'aborted') {
      break
    }
  }
  if (session.stage !== 'finished' && session.stage !== 'aborted') {
    await session.command('abort')
  }
  if (session.stage !== 'finished') {
    process.exitCode = 1
  }
} finally {
  terminal.close()
  await session.close()
}
