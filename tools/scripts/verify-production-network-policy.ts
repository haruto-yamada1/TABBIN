import { readFileSync } from 'node:fs'
import path from 'node:path'

import { assertChromeFirefoxManifestDelta } from './manifestSecurityInvariants.ts'
import {
  assertManifestMatchesProductionNetworkPolicy,
  assertProductionNetworkCallsiteInventory,
  collectProductionNetworkCallsites,
} from './production-network-policy.ts'

const projectRoot = path.resolve(import.meta.dirname, '..', '..')
const manifestPaths = [
  path.join(projectRoot, '.output', 'chrome-mv3', 'manifest.json'),
  path.join(projectRoot, '.output', 'firefox-mv2', 'manifest.json'),
]

const callsites = collectProductionNetworkCallsites(projectRoot)
assertProductionNetworkCallsiteInventory(callsites)

const loadedManifests = manifestPaths.map((manifestPath) => {
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
  assertManifestMatchesProductionNetworkPolicy(manifest, manifestPath)
  return { manifest, manifestPath }
})

const chromeManifest = loadedManifests.find((entry) =>
  entry.manifestPath.includes('chrome-mv3'),
)
const firefoxManifest = loadedManifests.find((entry) =>
  entry.manifestPath.includes('firefox-mv2'),
)
if (chromeManifest === undefined || firefoxManifest === undefined) {
  throw new Error(
    'expected both chrome-mv3 and firefox-mv2 generated manifests for delta verification',
  )
}
assertChromeFirefoxManifestDelta(
  chromeManifest.manifest,
  firefoxManifest.manifest,
  chromeManifest.manifestPath,
  firefoxManifest.manifestPath,
)

console.log(
  `production network policy verified (${callsites.length} inventoried call sites, ${manifestPaths.length} manifests, chrome/firefox delta checked)`,
)
