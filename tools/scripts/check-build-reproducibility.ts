import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { z } from 'zod'

import { collectArtifactSize } from './artifactSizeReport'
import { compareBuildZips } from './buildReproducibility'

const hash = (file: string) =>
  createHash('sha256').update(readFileSync(file)).digest('hex')
const git = (cwd: string, args: string[]) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()

export const createBuildCheckout = (
  source: string,
  revision: string,
  destination: string,
) => {
  mkdirSync(destination)
  git(destination, ['init', '--quiet'])
  git(destination, ['fetch', '--quiet', '--depth=1', source, revision])
  git(destination, ['checkout', '--quiet', '--detach', 'FETCH_HEAD'])
  if (git(destination, ['rev-parse', 'HEAD']) !== revision) {
    throw new Error('Build checkout SHA mismatch')
  }
}

const packageSchema = z.object({
  name: z.string().regex(/^[\w-]+$/u),
  version: z.string().regex(/^[\w.+-]+$/u),
})
const readJson = (file: string): unknown =>
  JSON.parse(readFileSync(file, 'utf8'))
const readVersion = (cwd: string, tool: string) =>
  z
    .object({ version: z.string() })
    .parse(readJson(path.join(cwd, 'node_modules', tool, 'package.json')))
    .version

export const checkBuildReproducibility = (
  source: string,
  ref: string,
  output: string,
) => {
  const revision = git(source, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${ref}^{commit}`,
  ])
  // Build committed source only. Neither dirty source nor ignored node_modules is copied.
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    TZ: 'UTC',
    LANG: 'C',
    LC_ALL: 'C',
    CI: 'true',
  }
  const node = execFileSync('node', ['--version'], {
    env,
    encoding: 'utf8',
  }).trim()
  const bun = execFileSync('bun', ['--version'], {
    env,
    encoding: 'utf8',
  }).trim()
  const configuredNode = git(source, ['show', `${revision}:.node-version`])
  const configuredBun = git(source, ['show', `${revision}:.bun-version`])
  if (node.split('.')[0] !== `v${configuredNode}` || bun !== configuredBun) {
    throw new Error(
      `Toolchain mismatch: require Node ${configuredNode}.x / Bun ${configuredBun}; got ${node} / ${bun}`,
    )
  }
  mkdirSync(output, { recursive: true })
  const directory = mkdtempSync(path.join(output, `${revision.slice(0, 12)}-`))
  console.log(`Reproducibility workspace: ${directory}`)
  const builds = []
  for (const label of ['a', 'b']) {
    console.log(`Independent build ${label}: ${revision}`)
    const checkout = path.join(directory, label)
    createBuildCheckout(source, revision, checkout)
    const log = openSync(path.join(directory, `${label}.log`), 'w')
    const commands = [
      ['install', '--frozen-lockfile'],
      ['run', 'zip'],
      ['run', 'zip:firefox'],
      ['run', 'verify:production-logging'],
      ['run', 'verify:app-version'],
      ['run', 'verify:persistence-release-compatibility'],
      ['run', 'verify:production-network-policy'],
      ['run', 'verify:firefox-artifact'],
      ['run', 'release:provenance'],
    ]
    const startedAt = new Date().toISOString()
    try {
      for (const args of commands) {
        console.log(`  ${label}: bun ${args.join(' ')}`)
        execFileSync('bun', args, {
          cwd: checkout,
          env,
          stdio: ['ignore', log, log],
        })
      }
    } catch (error) {
      throw new Error(
        `Independent build ${label} failed; inspect ${path.join(directory, `${label}.log`)}`,
        { cause: error },
      )
    } finally {
      closeSync(log)
    }
    if (git(checkout, ['status', '--porcelain']) !== '') {
      throw new Error(
        `Build ${label} changed committed source; inspect ${label}.log`,
      )
    }
    const metadata = packageSchema.parse(
      readJson(path.join(checkout, 'package.json')),
    )
    const outputDir = path.join(checkout, '.output')
    builds.push({
      label,
      startedAt,
      finishedAt: new Date().toISOString(),
      revision: git(checkout, ['rev-parse', 'HEAD']),
      bunLockSha256: hash(path.join(checkout, 'bun.lock')),
      runtime: {
        node,
        bun,
        wxt: readVersion(checkout, 'wxt'),
        vite: readVersion(checkout, 'vite'),
        platform: process.platform,
        arch: process.arch,
      },
      commands: commands.map((args) => `bun ${args.join(' ')}`),
      metadata,
      outputDir,
      provenance: readJson(
        path.join(
          outputDir,
          `${metadata.name}-${metadata.version}-build-metadata.json`,
        ),
      ),
      sbomSha256: hash(
        path.join(
          outputDir,
          `${metadata.name}-${metadata.version}-sbom.cdx.json`,
        ),
      ),
    })
  }
  const [a, b] = builds
  if (
    !a ||
    !b ||
    a.revision !== b.revision ||
    a.bunLockSha256 !== b.bunLockSha256 ||
    JSON.stringify(a.runtime) !== JSON.stringify(b.runtime)
  ) {
    throw new Error('Independent build inputs differ')
  }
  const browsers = (['chrome', 'firefox'] as const).map((browser) => {
    const fileName = `${a.metadata.name}-${a.metadata.version}-${browser}.zip`
    const zipA = path.join(a.outputDir, fileName)
    const zipB = path.join(b.outputDir, fileName)
    const comparison = compareBuildZips(readFileSync(zipA), readFileSync(zipB))
    const unpacked = `${browser}-${browser === 'chrome' ? 'mv3' : 'mv2'}`
    return {
      browser,
      fileName,
      ...comparison,
      sizes: {
        a: collectArtifactSize(path.join(a.outputDir, unpacked), zipA),
        b: collectArtifactSize(path.join(b.outputDir, unpacked), zipB),
      },
    }
  })
  const report = {
    schemaVersion: 1,
    revision,
    generatedAt: new Date().toISOString(),
    environment: { TZ: 'UTC', LANG: 'C', LC_ALL: 'C', CI: 'true' },
    builds: builds.map(({ outputDir: _outputDir, ...build }) => build),
    browsers,
  }
  writeFileSync(
    path.join(directory, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
  const markdown = [
    '# Independent extension build comparison',
    '',
    `Commit: ${revision}`,
    `Node ${node}; Bun ${bun}; WXT ${a.runtime.wxt}; Vite ${a.runtime.vite}; ${a.runtime.platform}/${a.runtime.arch}`,
    `bun.lock SHA-256: ${a.bunLockSha256}`,
    '',
    '| Browser | ZIP bytes equal | Extracted paths + SHA-256 equal | Entry order equal |',
    '| --- | --- | --- | --- |',
    ...browsers.map(
      (result) =>
        `| ${result.browser} | ${String(result.zipEqual)} | ${String(result.contentEqual)} | ${String(result.entryOrderEqual)} |`,
    ),
    '',
    ...browsers.flatMap((result) => [
      `## ${result.browser}`,
      `ZIP A: ${result.left.sha256}`,
      `ZIP B: ${result.right.sha256}`,
      `Added: ${result.added.join(', ') || 'none'}`,
      `Removed: ${result.removed.join(', ') || 'none'}`,
      `Changed: ${result.changed.join(', ') || 'none'}`,
      `Metadata differences: ${result.metadataChanges.length} (details and per-file hashes in report.json)`,
      '',
    ]),
    'Content equality is a conservative functional-equivalence signal, not a runtime test. No manifest, chunk name, source map, timestamp or other content is normalized.',
    'Each build retains its original ZIPs, sources ZIP, SBOM and provenance under a/.output and b/.output. SBOM UUID/timestamp and provenance buildTimestamp may differ; verify the distributed ZIP against that build metadata.',
    '',
  ].join('\n')
  writeFileSync(path.join(directory, 'report.md'), markdown)
  console.log(`Reproducibility report: ${path.join(directory, 'report.md')}`)
  return {
    directory,
    contentEqual: browsers.every((result) => result.contentEqual),
  }
}

if (import.meta.main) {
  const root = path.resolve(import.meta.dirname, '../..')
  const { values } = parseArgs({
    options: {
      ref: { type: 'string', default: 'HEAD' },
      output: { type: 'string', default: '.output/reproducibility' },
    },
    allowPositionals: false,
  })
  const result = checkBuildReproducibility(
    root,
    values.ref,
    path.resolve(root, values.output),
  )
  if (!result.contentEqual) {
    process.exitCode = 1
  }
}
