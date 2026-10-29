import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { IssueCase } from './contract'
import { buildArguments, runProcess, sanitizedEnvironment } from './runtime'
import { inspectTestReport } from './test-report'

export async function verifyCandidateValidation(
  workspace: string,
  readRoots: string[],
  item: IssueCase,
  validationArguments: string[],
  root: string,
) {
  const invocation = buildArguments({
    workspace,
    readRoots,
    allowedPaths: item.allowedPaths,
    model: 'gpt-6.1-sol',
    effort: 'high',
    denyReadPaths: [root],
  })
  const prefix = invocation
    .slice(0, invocation.indexOf('exec'))
    .filter((value) => value !== '--strict-config')
  const result = await runProcess(
    'codex',
    [
      ...prefix,
      'sandbox',
      '-P',
      'issue_eval',
      '-C',
      workspace,
      '--',
      'node',
      'node_modules/vitest/vitest.mjs',
      'run',
      '--config',
      'vitest.ci.config.ts',
      ...validationArguments,
      ...item.regressionTests,
      '--reporter=json',
      '--outputFile=.agent-tmp/public-validation.json',
    ],
    {
      cwd: workspace,
      env: {
        ...sanitizedEnvironment(),
        TMPDIR: path.join(workspace, '.agent-tmp'),
        SWC_NATIVE_BINDING_CACHE: path.join(workspace, '.agent-tmp/swc'),
      },
      timeoutMs: 60000,
    },
  )
  const report = inspectTestReport(
    readFileSync(
      path.join(workspace, '.agent-tmp/public-validation.json'),
      'utf8',
    ),
    item.expectedRegressionTests,
  )
  if (
    result.exitCode !== 0 ||
    result.timedOut ||
    result.outputLimit ||
    !report.passed
  ) {
    throw new Error(
      'Candidate validation command is not runnable in the fixed sandbox',
    )
  }
}
