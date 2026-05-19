import { execFileSync } from 'node:child_process'
import path from 'node:path'

import type { FullConfig } from '@playwright/test'

const resolveWxtBinary = () =>
  path.join(process.cwd(), 'node_modules', '.bin', 'wxt')

export default async (_config: FullConfig) => {
  execFileSync(resolveWxtBinary(), ['build'], {
    cwd: process.cwd(),
    stdio: 'inherit',
  })
}
