import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { unzipSync, zipSync } from 'fflate'
import type { Zippable } from 'fflate'

import {
  assertDigest,
  assertRelativeFile,
  INVENTORY_FILE,
  NOTICES_FILE,
  parseInventory,
  readContainedFile,
  sha256,
  SOURCE_DIRECTORY,
} from './licenseContract'
import type { LicenseInventory } from './licenseContract'
import { collectPackageLicenses } from './packageInventory'
import type { CollectedPackage, CollectedSource } from './packageInventory'

function renderNotices(
  packages: CollectedPackage[],
  sources: CollectedSource[],
) {
  const notices = [
    'TABBIN third-party notices',
    '',
    'The following npm distributions are included in this extension.',
    'Their original license, copyright and NOTICE texts follow in full.',
    'SPDX metadata is reported separately from the selected distribution license.',
    '',
  ]
  for (const pkg of packages) {
    notices.push(
      '='.repeat(78),
      `${pkg.name}@${pkg.version}`,
      `License: ${pkg.selectedLicense}`,
      `npm source: ${pkg.npm}`,
    )
    if (pkg.repository) {
      notices.push(`Upstream: ${pkg.repository}`)
    }
    if (pkg.metadataLicense !== pkg.selectedLicense) {
      notices.push(
        `Original metadata: ${pkg.metadataLicense ?? '(not specified)'}`,
      )
    }
    for (const document of pkg.documents) {
      notices.push('', `--- ${document.path} ---`)
      if (document.sourceUrl) {
        notices.push(`Verified original: ${document.sourceUrl}`)
      }
      notices.push(document.text)
    }
  }
  if (sources.length) {
    notices.push(
      '='.repeat(78),
      'MPL source availability',
      '',
      'The corresponding preferred-form source for the MPL-covered components is',
      'included in this extension archive at the paths below. Extract the source',
      'archive with a standard tar/gzip utility. These components remain available',
      'under MPL-2.0; the other components retain their own licenses.',
    )
    for (const source of sources) {
      notices.push(
        '',
        `${source.name}@${source.version}: ${source.path}`,
        `Upstream source: ${source.sourceUrl}`,
        `SHA-256: ${source.sha256}`,
      )
    }
  }
  return `${notices.join('\n')}\n`
}

export async function writeThirdPartyLicenseFiles(options: {
  outDir: string
  moduleIds: string[]
  projectRoot?: string
}): Promise<{ packageCount: number; emittedFiles: string[] }> {
  const { packages, sources } = collectPackageLicenses(
    options.projectRoot ?? process.cwd(),
    options.moduleIds,
  )
  const notices = renderNotices(packages, sources)
  const inventory: LicenseInventory = {
    schemaVersion: 1,
    notices: { path: NOTICES_FILE, sha256: sha256(notices) },
    packages: packages.map((pkg) => ({
      ...pkg,
      documents: pkg.documents.map(({ text: _text, ...document }) => document),
    })),
    sources: sources.map(({ contents: _contents, ...source }) => source),
  }
  const serialized = `${JSON.stringify(inventory, null, 2)}\n`
  parseInventory(Buffer.from(serialized))
  await mkdir(options.outDir, { recursive: true })
  await rm(path.join(options.outDir, SOURCE_DIRECTORY), {
    recursive: true,
    force: true,
  })
  await Promise.all(
    sources.map(async (source) => {
      await mkdir(path.dirname(path.join(options.outDir, source.path)), {
        recursive: true,
      })
      await writeFile(path.join(options.outDir, source.path), source.contents)
    }),
  )
  await Promise.all([
    writeFile(path.join(options.outDir, NOTICES_FILE), notices),
    writeFile(path.join(options.outDir, INVENTORY_FILE), serialized),
  ])
  await verifyThirdPartyLicenseFiles(options.outDir)
  return {
    packageCount: packages.length,
    emittedFiles: [
      INVENTORY_FILE,
      NOTICES_FILE,
      ...sources.map((source) => source.path),
    ].toSorted(),
  }
}

function verifyContents(
  inventory: LicenseInventory,
  read: (file: string) => Uint8Array,
) {
  assertDigest(read(NOTICES_FILE), inventory.notices.sha256, NOTICES_FILE)
  for (const source of inventory.sources) {
    assertDigest(read(source.path), source.sha256, source.path)
  }
}

export async function verifyThirdPartyLicenseFiles(
  outDir: string,
): Promise<void> {
  const inventory = parseInventory(
    await readFile(path.join(outDir, INVENTORY_FILE)),
  )
  verifyContents(inventory, (file) => readContainedFile(outDir, file))
}

export async function addThirdPartyLicenseFilesToSourceZip(
  zipFile: string,
  outDir: string,
): Promise<void> {
  await verifyThirdPartyLicenseFiles(outDir)
  const inventory = parseInventory(
    await readFile(path.join(outDir, INVENTORY_FILE)),
  )
  const inputEntries = unzipSync(await readFile(zipFile))
  for (const name of Object.keys(inputEntries)) {
    assertRelativeFile(name.replace(/\/$/, ''))
  }
  const entries = new Map<string, Uint8Array>(
    Object.entries(inputEntries).filter(
      ([name]) =>
        name !== NOTICES_FILE &&
        name !== INVENTORY_FILE &&
        !name.startsWith(`${SOURCE_DIRECTORY}/`),
    ),
  )
  for (const file of [
    NOTICES_FILE,
    INVENTORY_FILE,
    ...inventory.sources.map((source) => source.path),
  ]) {
    entries.set(file, readContainedFile(outDir, file))
  }
  const ordered: Zippable = {}
  for (const [name, contents] of [...entries].toSorted(([a], [b]) =>
    a.localeCompare(b, 'en'),
  )) {
    ordered[name] = [
      contents,
      { mtime: new Date('1980-01-01T00:00:00Z'), level: 9 },
    ]
  }
  await writeFile(zipFile, zipSync(ordered))
  await verifyThirdPartyLicenseZip(zipFile)
}

export async function verifyThirdPartyLicenseZip(
  zipFile: string,
): Promise<void> {
  const entries = unzipSync(await readFile(zipFile))
  for (const name of Object.keys(entries)) {
    assertRelativeFile(name.replace(/\/$/, ''))
  }
  const read = (file: string): Uint8Array => {
    const contents = entries[file]
    if (!contents) {
      throw new Error(`Missing legal ZIP entry: ${file}`)
    }
    return contents
  }
  verifyContents(parseInventory(read(INVENTORY_FILE)), read)
}
