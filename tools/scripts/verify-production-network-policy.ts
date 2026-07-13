import { readFileSync } from 'node:fs'
import path from 'node:path'

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

for (const manifestPath of manifestPaths) {
  const manifest: unknown = JSON.parse(readFileSync(manifestPath, 'utf8'))
  assertManifestMatchesProductionNetworkPolicy(manifest, manifestPath)
}

console.log(
  `production network policy verified (${callsites.length} inventoried call sites, ${manifestPaths.length} manifests)`,
)
