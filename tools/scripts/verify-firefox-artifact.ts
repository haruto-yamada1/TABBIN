import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { assertFirefoxArtifactContract } from './firefoxArtifactContract.ts'

const projectRoot = path.resolve(import.meta.dirname, '..', '..')
const artifactDir = path.join(projectRoot, '.output', 'firefox-mv2')
const manifestPath = path.join(artifactDir, 'manifest.json')

if (!existsSync(manifestPath)) {
  throw new Error(
    `Firefox artifact missing: ${manifestPath}. Run \`bun run build:firefox\` before this verifier.`,
  )
}

const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))

const fileExists = (relativePath: string): boolean =>
  existsSync(path.join(artifactDir, relativePath))

assertFirefoxArtifactContract({ manifest, fileExists, label: 'firefox-mv2' })

console.log(`verified: ${artifactDir} passes Firefox artifact contract`)
