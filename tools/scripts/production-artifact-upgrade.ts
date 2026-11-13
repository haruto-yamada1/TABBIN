import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import {
  decodePublishedArtifactManifest,
  resolvePublishedArtifact,
} from './publishedArtifact'
import {
  readPersistenceReleaseArtifact,
  verifyPersistenceUpgradeCompatibility,
} from './verify-persistence-release-compatibility'

const projectRoot = path.resolve(import.meta.dirname, '..', '..')
const defaultPinPath = path.join(
  projectRoot,
  'tools/release/published-artifacts.json',
)
const defaultCurrentDirectory = path.join(projectRoot, '.output/chrome-mv3')
const defaultDownloadDirectory = path.join(
  projectRoot,
  '.output/upgrade-artifacts',
)

type Options = {
  readonly currentDirectory: string
  readonly downloadDirectory: string
  readonly pinPath: string
}

const usage = `Usage: bun tools/scripts/production-artifact-upgrade.ts [options]

Verifies that data written by the published Chrome Web Store artifact survives
an update to the current build. The current build must exist before running.

Options:
  --pin <file>             Pinned published artifact metadata
                           (default: tools/release/published-artifacts.json)
  --current-dir <dir>      Current unpacked Chrome build
                           (default: .output/chrome-mv3)
  --download-dir <dir>     Download/extraction directory
                           (default: .output/upgrade-artifacts)
  --help                   Show this message`

const readFlagValue = (
  args: readonly string[],
  index: number,
  flag: string,
): string => {
  const value = args[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} requires a value.`)
  }
  return value
}

const parseOptions = (args: readonly string[]): Options | undefined => {
  let currentDirectory = defaultCurrentDirectory
  let downloadDirectory = defaultDownloadDirectory
  let pinPath = defaultPinPath
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]
    if (argument === undefined) {
      throw new Error('Argument parsing stopped unexpectedly.')
    }
    switch (argument) {
      case '--help': {
        console.log(usage)
        return undefined
      }
      case '--current-dir': {
        currentDirectory = path.resolve(readFlagValue(args, index, argument))
        index += 1
        break
      }
      case '--download-dir': {
        downloadDirectory = path.resolve(readFlagValue(args, index, argument))
        index += 1
        break
      }
      case '--pin': {
        pinPath = path.resolve(readFlagValue(args, index, argument))
        index += 1
        break
      }
      default: {
        throw new Error(`Unknown argument: ${argument}\n\n${usage}`)
      }
    }
  }
  return { currentDirectory, downloadDirectory, pinPath }
}

const readPinnedManifest = (pinPath: string) => {
  if (!existsSync(pinPath)) {
    throw new Error(`Published artifact pin is missing: ${pinPath}`)
  }
  return decodePublishedArtifactManifest(
    JSON.parse(readFileSync(pinPath, 'utf8')),
  )
}

const run = async (args: readonly string[]): Promise<void> => {
  const options = parseOptions(args)
  if (options === undefined) {
    return
  }
  if (!existsSync(path.join(options.currentDirectory, 'manifest.json'))) {
    throw new Error(
      `Current Chrome artifact is missing at ${options.currentDirectory}. Run bun run build first.`,
    )
  }

  const manifest = readPinnedManifest(options.pinPath)
  const startedAt = Date.now()
  const downloadStartedAt = Date.now()
  const previous = await resolvePublishedArtifact({
    browser: 'chrome',
    manifest,
    outputDirectory: options.downloadDirectory,
  })
  const downloadMs = Date.now() - downloadStartedAt
  if (previous.status === 'excluded') {
    throw new Error(
      `Published Chrome artifact is excluded from upgrade verification: ${previous.reason}`,
    )
  }

  const previousArtifact = readPersistenceReleaseArtifact(previous.directory)
  const candidateArtifact = readPersistenceReleaseArtifact(
    options.currentDirectory,
  )
  const compatibility = verifyPersistenceUpgradeCompatibility({
    candidate: candidateArtifact,
    previous: previousArtifact,
  })

  const browserStartedAt = Date.now()
  const result = spawnSync(
    process.execPath,
    [
      path.join(
        projectRoot,
        'tools/scripts/production-artifact-upgrade-smoke.ts',
      ),
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        TABBIN_CURRENT_ARTIFACT_DIR: options.currentDirectory,
        TABBIN_PREVIOUS_ARTIFACT_DIR: previous.directory,
        TABBIN_PREVIOUS_ARTIFACT_LABEL: `${previous.label} sha256:${previous.sha256}`,
      },
      stdio: 'inherit',
    },
  )
  const browserMs = Date.now() - browserStartedAt
  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(
      `Published artifact upgrade smoke failed with exit code ${String(result.status)}.`,
    )
  }

  console.log(
    JSON.stringify(
      {
        browser: 'chrome',
        browserMs,
        candidateAppVersion: compatibility.candidateAppVersion,
        destructiveSchemaChange: compatibility.destructiveSchemaChange,
        downloadMs,
        fromVersion: compatibility.previousAppVersion,
        persistenceGeneration: compatibility.persistenceGeneration,
        previousSha256: previous.sha256,
        source: previous.label,
        status: 'passed',
        toVersion: compatibility.candidateAppVersion,
        totalMs: Date.now() - startedAt,
      },
      null,
      2,
    ),
  )
}

try {
  await run(process.argv.slice(2))
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
