import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { z } from 'zod'

export function prepareValidation(workspace: string): string[] {
  mkdirSync(path.join(workspace, 'node_modules/.vitest'), {
    recursive: true,
    mode: 0o700,
  })
  writeFileSync(
    path.join(workspace, 'node_modules/.vitest/.vitest-secret-token'),
    `${randomUUID()}\n`,
    { mode: 0o600 },
  )
  const version = z
    .object({ version: z.string() })
    .parse(
      JSON.parse(
        readFileSync(
          path.join(workspace, 'node_modules/vitest/package.json'),
          'utf8',
        ),
      ),
    ).version
  return [
    '--configLoader=native',
    '--cache=false',
    ...(version.startsWith('5.')
      ? ['--fsModuleCachePath=.agent-tmp/fs-cache']
      : []),
  ]
}
