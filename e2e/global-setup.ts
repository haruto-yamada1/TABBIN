/* eslint-disable import/no-default-export, typescript/require-await -- Playwright globalSetup contract requires default exported async function */
import { execFileSync } from 'node:child_process'
import path from 'node:path'

import type { FullConfig } from '@playwright/test'

const resolveWxtBinary = () =>
  path.join(process.cwd(), 'node_modules', '.bin', 'wxt')

const wxtBuildGlobalSetup = async (_config: FullConfig) => {
  execFileSync(resolveWxtBinary(), ['build'], {
    cwd: process.cwd(),
    stdio: 'inherit',
  })
}

export default wxtBuildGlobalSetup
