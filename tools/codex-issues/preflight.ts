import { spawnSync } from 'node:child_process'

import { proveSandbox } from './pressure'
import { sanitizedEnvironment } from './runtime'

export async function executionPreflight(root: string, real: boolean) {
  try {
    const options = {
      encoding: 'utf8',
      env: sanitizedEnvironment(),
      timeout: 15000,
    } as const
    const version = spawnSync('codex', ['--version'], options)
    if (
      version.status !== 0 ||
      !/^codex-cli 0\.(?:1[6-9]\d|[2-9]\d\d)\./u.test(version.stdout.trim())
    ) {
      throw new Error('Unsupported Codex runtime')
    }
    if (real) {
      const auth = spawnSync('codex', ['login', 'status'], options)
      if (auth.status !== 0 || !/chatgpt/iu.test(auth.stdout + auth.stderr)) {
        throw new Error('Subscription authentication unavailable')
      }
    }
    const sandboxProof = await proveSandbox(root)
    return { passed: true, codexVersion: version.stdout.trim(), sandboxProof }
  } catch {
    return { passed: false, codexVersion: null, sandboxProof: null }
  }
}
