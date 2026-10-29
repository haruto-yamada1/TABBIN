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
import { collectArtifactSize, fingerprintArtifact } from './artifactSizeReport'
import {
  assertLoadProvenance,
  parseInitialLoadReport,
  parseLoadObservations,
  renderInitialLoadReport,
} from './initialLoadReport'

const root = path.resolve(import.meta.dirname, '../..')
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    baseline: { type: 'string', default: 'tools/bundle-size/baseline.json' },
    policy: { type: 'string', default: 'tools/bundle-size/policy.json' },
    output: { type: 'string', default: '.output/size-report' },
    loads: {
      type: 'string',
      default: '.output/size-report/initial-load-observations.json',
    },
    'load-baseline': {
      type: 'string',
      default: 'tools/bundle-size/initial-load-baseline.json',
    },
    'write-baseline': { type: 'string' },
    'write-load-baseline': { type: 'string' },
  },
  allowPositionals: false,
})
if (values['write-baseline'] && values['write-load-baseline']) {
  throw new Error('Choose one baseline to update')
}
const readJson = (file: string): unknown =>
  JSON.parse(readFileSync(path.resolve(root, file), 'utf8'))
const metadata = z
  .object({
    name: z.string().regex(/^[\w-]+$/u),
    version: z.string().regex(/^[\w.+-]+$/u),
  })
  .parse(readJson('package.json'))
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
  cwd: root,
  encoding: 'utf8',
}).trim()
const observations = values['write-baseline']
  ? undefined
  : parseLoadObservations(readJson(values.loads))
if (observations) {
  assertLoadProvenance(observations, revision, {
    chrome: fingerprintArtifact(path.join(root, '.output/chrome-mv3')),
    firefox: fingerprintArtifact(path.join(root, '.output/firefox-mv2')),
  })
}
const measure = (browser: 'chrome' | 'firefox', manifest: 'mv2' | 'mv3') => {
  const directory = path.join(root, '.output', `${browser}-${manifest}`)
  return collectArtifactSize(
    directory,
    path.join(
      root,
      '.output',
      `${metadata.name}-${metadata.version}-${browser}.zip`,
    ),
    observations?.browsers[browser].features,
  )
}
const { initialLoads: chromeLoads, ...chrome } = measure('chrome', 'mv3')
const { initialLoads: firefoxLoads, ...firefox } = measure('firefox', 'mv2')
const current = parseSizeReport({
  schemaVersion: 1,
  revision,
  environment: `${process.platform}/${process.arch}; Node ${process.versions.node}; Bun ${process.versions.bun ?? 'unavailable'}`,
  browsers: { chrome, firefox },
})
const loads = observations
  ? parseInitialLoadReport({
      ...observations,
      browsers: {
        chrome: {
          browserVersion: observations.browsers.chrome.browserVersion,
          artifactSha256: observations.browsers.chrome.artifactSha256,
          sizes: chromeLoads,
        },
        firefox: {
          browserVersion: observations.browsers.firefox.browserVersion,
          artifactSha256: observations.browsers.firefox.artifactSha256,
          sizes: firefoxLoads,
        },
      },
    })
  : undefined
const writeJson = (file: string, value: unknown) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}
if (values['write-baseline']) {
  const destination = path.resolve(root, values['write-baseline'])
  writeJson(destination, current)
  console.log(`Artifact size baseline written: ${destination}`)
} else if (values['write-load-baseline']) {
  const destination = path.resolve(root, values['write-load-baseline'])
  writeJson(destination, loads)
  console.log(`Initial-load baseline written: ${destination}`)
} else {
  if (!loads) {
    throw new Error('Initial loads are required')
  }
  const baseline = parseSizeReport(readJson(values.baseline))
  const loadBaseline = parseInitialLoadReport(readJson(values['load-baseline']))
  const policy = parseSizePolicy(readJson(values.policy))
  const output = path.resolve(root, values.output)
  const markdown = `${renderSizeReport(
    current,
    baseline,
    policy,
  )}\n${renderInitialLoadReport(loads, loadBaseline, policy)}`
  writeJson(path.join(output, 'report.json'), current)
  writeJson(path.join(output, 'initial-load-report.json'), loads)
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
