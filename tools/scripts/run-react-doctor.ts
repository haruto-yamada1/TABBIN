import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import JSON5 from 'json5'

import {
  readReviewedLicenseContents,
  verifyDependencyLicensePolicy,
} from './dependency-license-policy'

type DoctorExecution = {
  status: number | null
  error?: Error | undefined
}

type DoctorOptions = {
  root?: string
  verify?: () => void
  execute?: (
    executable: string,
    args: string[],
    root: string,
  ) => DoctorExecution
}

export function runReactDoctor(
  args: string[],
  options: DoctorOptions = {},
): number {
  const root = options.root ?? process.cwd()
  const verify =
    options.verify ??
    (() => {
      const lock = JSON5.parse<unknown>(
        readFileSync(path.join(root, 'bun.lock'), 'utf8'),
      )
      verifyDependencyLicensePolicy(
        JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')),
        lock,
        readReviewedLicenseContents(lock, root),
      )
    })
  // Ordinary TABBIN product diagnostics only. No registry lookup or npx fallback
  // can select an unreviewed executable after this local distribution check.
  verify()
  const execute =
    options.execute ??
    ((executable, forwarded, cwd) =>
      spawnSync(executable, forwarded, { cwd, stdio: 'inherit' }))
  const result = execute(
    'node',
    [path.join(root, 'node_modules/react-doctor/bin/react-doctor.js'), ...args],
    root,
  )
  if (result.error) {
    throw result.error
  }
  return result.status ?? 1
}

if (import.meta.main) {
  process.exitCode = runReactDoctor(process.argv.slice(2))
}
