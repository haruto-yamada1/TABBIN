/* eslint-disable import/no-default-export, typescript/require-await -- Playwright globalSetup contract */
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const setupRenderingBuild = async () => {
  execFileSync(
    path.join(process.cwd(), 'node_modules', '.bin', 'wxt'),
    ['build', '--config', 'wxt.rendering.config.ts'],
    { cwd: process.cwd(), stdio: 'inherit' },
  )
  process.env.TABBIN_E2E_EXTENSION_PATH = path.join(
    process.cwd(),
    '.output',
    'rendering',
    'chrome-mv3',
  )
}

export default setupRenderingBuild
