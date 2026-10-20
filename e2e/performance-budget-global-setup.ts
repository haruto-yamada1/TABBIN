/* eslint-disable import/no-default-export -- Playwright globalSetup contract */
import { execFileSync } from 'node:child_process'

import setupRenderingBuild from './rendering-global-setup'

export default async function setupBudgetBuild() {
  await setupRenderingBuild()
  execFileSync(
    'bun',
    [
      'build',
      'e2e/support/performance-budget-opening.ts',
      '--outfile=.output/rendering/chrome-mv3/performance-budget-opening.js',
      '--target=browser',
      '--format=iife',
      '--define',
      'import.meta.env={"DEV":false,"PROD":true,"MODE":"test"}',
    ],
    { cwd: process.cwd(), stdio: 'inherit' },
  )
}
