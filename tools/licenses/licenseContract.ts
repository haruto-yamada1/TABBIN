import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'

import { z } from 'zod'

export const NOTICES_FILE = 'THIRD_PARTY_NOTICES.txt'
export const INVENTORY_FILE = 'THIRD_PARTY_LICENSES.json'
export const SOURCE_DIRECTORY = 'third-party-sources'

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/)
const identitySchema = {
  name: z.string().regex(/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/i),
  version: z.string().regex(/^\d+\.\d+\.\d+(?:[-+][a-z0-9.+-]+)?$/i),
}
const provenanceSchema = {
  packageIntegrity: z.string().regex(/^sha512-[a-z0-9+/]{86}==$/i),
  provenanceNote: z.string().optional(),
  provenanceUrl: z.url().optional(),
}
const documentSchema = z.object({
  path: z.string().min(1),
  sha256: hashSchema,
  sourceUrl: z.url().optional(),
})
const packageSchema = z.object({
  ...identitySchema,
  metadataLicense: z.string().nullable(),
  selectedLicense: z.string(),
  npm: z.url(),
  repository: z.string().nullable(),
  modules: z.array(z.string()).min(1),
  documents: z.array(documentSchema).min(1),
  reviewedLicense: z
    .object({
      sourceUrl: z.url(),
      expectedMetadataLicense: z.string().min(1).optional(),
      ...provenanceSchema,
    })
    .optional(),
})
export const sourceSchema = z.object({
  ...identitySchema,
  license: z.string(),
  path: z.string().min(1),
  sha256: hashSchema,
  sourceUrl: z.url(),
  sourceCommit: z
    .string()
    .regex(/^[a-f0-9]{40}$/)
    .optional(),
  ...provenanceSchema,
})
export const reviewedSchema = z.object({
  ...identitySchema,
  license: z.string(),
  expectedMetadataLicense: z.string().min(1).optional(),
  sourceUrl: z.url(),
  ...provenanceSchema,
  files: z
    .array(documentSchema.extend({ originalPath: z.string().min(1) }))
    .min(1),
})
const inventorySchema = z.object({
  schemaVersion: z.literal(1),
  notices: z.object({ path: z.literal(NOTICES_FILE), sha256: hashSchema }),
  packages: z.array(packageSchema).min(1),
  sources: z.array(sourceSchema),
})

export type LegalDocument = z.infer<typeof documentSchema>
export type PackageLicense = z.infer<typeof packageSchema>
export type SourceFile = z.infer<typeof sourceSchema>
export type LicenseInventory = z.infer<typeof inventorySchema>
export type ReviewedLicense = z.infer<typeof reviewedSchema>

const licenses = new Set([
  'MIT',
  'Apache-2.0',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'MPL-2.0',
  'MIT AND ISC',
])

export function selectedLicense(value: string | null): string {
  if (value === '(MPL-2.0 OR Apache-2.0)') {
    return 'Apache-2.0'
  }
  if (value && licenses.has(value)) {
    return value
  }
  throw new Error(`Unsupported license: ${value ?? 'UNKNOWN'}`)
}

export function assertRuntimePackage(name: string) {
  if (
    ['react-doctor', 'oxlint-plugin-react-doctor', 'node-forge'].includes(name)
  ) {
    throw new Error(`Development-only package bundled in runtime: ${name}`)
  }
}

export function sha256(contents: Uint8Array | string): string {
  return createHash('sha256').update(contents).digest('hex')
}

export function assertRelativeFile(value: string): void {
  if (
    !value ||
    value.includes('\\') ||
    value.includes('\0') ||
    path.posix.isAbsolute(value) ||
    value.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error(`Unsafe legal file path (traversal): ${value}`)
  }
}

export function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child)
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  )
}

export function readContainedFile(root: string, relative: string): Buffer {
  assertRelativeFile(relative)
  const target = path.join(root, relative)
  let current = root
  for (const segment of relative.split('/')) {
    current = path.join(current, segment)
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`Symlink not allowed in legal file: ${relative}`)
    }
  }
  if (!isInside(realpathSync(root), realpathSync(target))) {
    throw new Error(`Legal file escapes root: ${relative}`)
  }
  return readFileSync(target)
}

export function assertDigest(
  actual: Uint8Array,
  expected: string,
  label: string,
) {
  if (!hashSchema.safeParse(expected).success || sha256(actual) !== expected) {
    throw new Error(`Legal file digest mismatch: ${label}`)
  }
}

export function assertFullLicense(
  license: string,
  texts: string[],
  name: string,
) {
  const text = texts.join('\n').toLowerCase().replace(/\s+/g, ' ')
  const signatures: Record<string, string[]> = {
    MIT: ['permission is hereby granted', 'the software is provided'],
    'Apache-2.0': ['terms and conditions for use', 'grant of patent license'],
    ISC: ['permission to use, copy, modify', 'the software is provided'],
    'BSD-2-Clause': [
      'redistributions of source code',
      'redistributions in binary form',
      'express or implied warranties',
    ],
    'BSD-3-Clause': [
      'redistributions of source code',
      'redistributions in binary form',
      'neither the name',
      'express or implied warranties',
    ],
    '0BSD': ['permission to use, copy, modify', 'the software is provided'],
    'MPL-2.0': [
      'mozilla public license',
      'source code form',
      '3.2. distribution of executable form',
    ],
  }
  for (const part of license.split(' AND ')) {
    if (!signatures[part]?.every((signature) => text.includes(signature))) {
      throw new Error(`Missing full ${part} license text: ${name}`)
    }
  }
}

export function assertProvenance(url: string) {
  if (new URL(url).protocol !== 'https:') {
    throw new Error(`Legal provenance must use HTTPS: ${url}`)
  }
}

function validatePackages(value: LicenseInventory) {
  const ids = new Set<string>()
  for (const pkg of value.packages) {
    const id = `${pkg.name}@${pkg.version}`
    if (ids.has(id)) {
      throw new Error(`Duplicate package license inventory: ${id}`)
    }
    ids.add(id)
    assertRuntimePackage(pkg.name)
    selectedLicense(pkg.selectedLicense)
    for (const document of pkg.documents) {
      assertRelativeFile(document.path)
    }
    for (const module of pkg.modules) {
      assertRelativeFile(module)
    }
    if (
      pkg.selectedLicense === 'MPL-2.0' &&
      !value.sources.some(
        (source) =>
          source.name === pkg.name &&
          source.version === pkg.version &&
          source.license === 'MPL-2.0',
      )
    ) {
      throw new Error(`Missing matching MPL source: ${id}`)
    }
  }
  return ids
}

export function parseInventory(contents: Uint8Array): LicenseInventory {
  const value = inventorySchema.parse(
    JSON.parse(Buffer.from(contents).toString('utf8')),
  )
  const ids = validatePackages(value)
  const paths = new Set<string>()
  for (const source of value.sources) {
    assertRelativeFile(source.path)
    if (
      !source.path.startsWith(`${SOURCE_DIRECTORY}/`) ||
      !ids.has(`${source.name}@${source.version}`) ||
      paths.has(source.path)
    ) {
      throw new Error(`Invalid legal source entry: ${source.path}`)
    }
    paths.add(source.path)
    assertProvenance(source.sourceUrl)
  }
  return value
}
