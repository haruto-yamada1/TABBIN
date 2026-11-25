import { lstatSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { unzipSync } from 'fflate'

import { academyManifest } from './fixture'

const markers = [
  academyManifest.seed,
  ...academyManifest.sites.map((site) => site.hostname),
]
const filmingPath =
  /(?:^|\/)tools\/academy(?:\/|$)|(?:^|\/)e2e\/(?:helpers\/academy-fixture\.ts|academy-fixtures\.extension\.spec\.ts)$/u

const assertClean = (name: string, bytes: Uint8Array): void => {
  const content = new TextDecoder().decode(bytes)
  if (
    filmingPath.test(name.replaceAll('\\', '/')) ||
    markers.some((marker) => content.includes(marker))
  ) {
    throw new Error(`Academy fixture leaked into production artifact: ${name}`)
  }
}

const inspectFile = (filename: string, label: string): void => {
  const bytes = readFileSync(filename)
  assertClean(label, bytes)
  if (filename.endsWith('.zip')) {
    for (const [name, content] of Object.entries(unzipSync(bytes))) {
      assertClean(`${label}/${name}`, content)
    }
  }
}

const inspectPath = (filename: string, label: string): void => {
  const stat = lstatSync(filename)
  if (stat.isDirectory()) {
    for (const name of readdirSync(filename)) {
      inspectPath(path.join(filename, name), `${label}/${name}`)
    }
  } else if (stat.isFile()) {
    inspectFile(filename, label)
  } else {
    throw new Error(`Unsupported artifact entry: ${filename}`)
  }
}

export const verifyAcademyArtifacts = (paths: readonly string[]): void => {
  if (paths.length === 0) {
    throw new Error(
      'Pass production build directories or ZIP paths to inspect.',
    )
  }
  for (const filename of paths) {
    inspectPath(filename, filename)
  }
}

if (import.meta.main) {
  verifyAcademyArtifacts(process.argv.slice(2))
  console.log('Verified: no Academy filming fixtures in production artifacts.')
}
