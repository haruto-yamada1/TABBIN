import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { z } from 'zod'

import {
  checkHardBudgets,
  parseSizePolicy,
  parseSizeReport,
  renderSizeReport,
} from './artifactSizeComparison'
import { collectArtifactSize } from './artifactSizeReport'

const root = path.resolve(import.meta.dirname, '../..')
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    baseline: { type: 'string', default: 'tools/bundle-size/baseline.json' },
    policy: { type: 'string', default: 'tools/bundle-size/policy.json' },
    output: { type: 'string', default: '.output/size-report' },
    'write-baseline': { type: 'string' },
  },
  allowPositionals: false,
})
const readJson = (file: string): unknown =>
  JSON.parse(readFileSync(path.resolve(root, file), 'utf8'))
const metadata = z
  .object({
    name: z.string().regex(/^[\w-]+$/u),
    version: z.string().regex(/^[\w.+-]+$/u),
  })
  .parse(readJson('package.json'))
const measure = (browser: 'chrome' | 'firefox', manifest: 'mv2' | 'mv3') =>
  collectArtifactSize(
    path.join(root, '.output', `${browser}-${manifest}`),
    path.join(
      root,
      '.output',
      `${metadata.name}-${metadata.version}-${browser}.zip`,
    ),
  )
const current = parseSizeReport({
  schemaVersion: 1,
  revision: execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim(),
  environment: `${process.platform}/${process.arch}; Node ${process.versions.node}; Bun ${process.versions.bun ?? 'unavailable'}`,
  browsers: {
    chrome: measure('chrome', 'mv3'),
    firefox: measure('firefox', 'mv2'),
  },
})
const writeJson = (file: string) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(current, null, 2)}\n`)
}
if (values['write-baseline']) {
  const destination = path.resolve(root, values['write-baseline'])
  writeJson(destination)
  console.log(`Artifact size baseline written: ${destination}`)
} else {
  const baseline = parseSizeReport(readJson(values.baseline))
  const policy = parseSizePolicy(readJson(values.policy))
  const output = path.resolve(root, values.output)
  const markdown = renderSizeReport(current, baseline, policy)
  writeJson(path.join(output, 'report.json'))
  writeFileSync(path.join(output, 'report.md'), markdown)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown)
  }
  console.log(`Artifact size report: ${path.join(output, 'report.md')}`)
  const failures = checkHardBudgets(current, policy)
  if (failures.length > 0) {
    console.error(failures.join('\n'))
    process.exitCode = 1
  }
}
