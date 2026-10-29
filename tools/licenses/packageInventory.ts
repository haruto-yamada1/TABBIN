import { readFileSync, readdirSync, realpathSync } from 'node:fs'
import path from 'node:path'

import JSON5 from 'json5'
import { z } from 'zod'

import {
  assertDigest,
  assertFullLicense,
  assertProvenance,
  assertRelativeFile,
  assertRuntimePackage,
  isInside,
  readContainedFile,
  reviewedSchema,
  selectedLicense,
  sha256,
  sourceSchema,
} from './licenseContract'
import type {
  LegalDocument,
  PackageLicense,
  ReviewedLicense,
  SourceFile,
} from './licenseContract'

const packageManifestSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  license: z
    .union([z.string(), z.object({ type: z.string().optional() })])
    .optional(),
  repository: z
    .union([z.string(), z.object({ url: z.string().optional() })])
    .optional(),
})
type PackageManifest = z.infer<typeof packageManifestSchema>
type DocumentWithText = LegalDocument & { text: string }
export type CollectedPackage = Omit<PackageLicense, 'documents'> & {
  documents: DocumentWithText[]
}
export type CollectedSource = SourceFile & { contents: Uint8Array }
type PackageRoot = {
  root: string
  metadata: PackageManifest
  modules: Set<string>
}

const resolutionSchema = z.tuple([
  z.string(),
  z.enum(['', 'https://registry.npmjs.org']),
  z.unknown(),
  z.string(),
])

function assertReviewedIntegrity(
  projectRoot: string,
  entry: {
    name: string
    version: string
    packageIntegrity: string
  },
) {
  const lock = z
    .object({ packages: z.record(z.string(), z.unknown()) })
    .parse(
      JSON5.parse(readFileSync(path.join(projectRoot, 'bun.lock'), 'utf8')),
    )
  const id = `${entry.name}@${entry.version}`
  const candidates = Object.values(lock.packages).filter(
    (value) => Array.isArray(value) && value[0] === id,
  )
  if (
    !candidates.length ||
    candidates.some((candidate) => {
      const result = resolutionSchema.safeParse(candidate)
      return !result.success || result.data[3] !== entry.packageIntegrity
    })
  ) {
    throw new Error(`Reviewed package integrity differs from bun.lock: ${id}`)
  }
}

const legalNamePattern =
  /^(licen[cs]es?|copying|notices?|copyright)(?:[._-].*)?$/i

function isLegalTextFile(name: string, legalDirectory: boolean): boolean {
  return (
    legalDirectory ||
    (legalNamePattern.test(name) &&
      !/\.(?:[cm]?[jt]sx?|map|json|yml|yaml)$/i.test(name))
  )
}

function legalDocuments(
  root: string,
  relative = '',
  legalDirectory = false,
): DocumentWithText[] {
  const result: DocumentWithText[] = []
  for (const entry of readdirSync(path.join(root, relative), {
    withFileTypes: true,
  })) {
    const file = path.posix.join(relative, entry.name)
    const legalName = legalNamePattern.test(entry.name)
    if (entry.isSymbolicLink() && (legalDirectory || legalName)) {
      throw new Error(`Symlink not allowed in legal file: ${file}`)
    }
    if (entry.isDirectory() && !['node_modules', '.git'].includes(entry.name)) {
      result.push(...legalDocuments(root, file, legalDirectory || legalName))
    } else if (entry.isFile() && isLegalTextFile(entry.name, legalDirectory)) {
      const contents = readContainedFile(root, file)
      if (!contents.length || contents.includes(0)) {
        throw new Error(`Invalid license text: ${file}`)
      }
      result.push({
        path: file,
        sha256: sha256(contents),
        text: contents.toString('utf8'),
      })
    }
  }
  return result.toSorted((a, b) => a.path.localeCompare(b.path, 'en'))
}

function readCatalogs(legalDir: string) {
  const reviewed = z
    .array(reviewedSchema)
    .parse(
      JSON.parse(
        readContainedFile(legalDir, 'reviewed-licenses.json').toString('utf8'),
      ),
    )
  const sources = z
    .array(sourceSchema)
    .parse(
      JSON.parse(readContainedFile(legalDir, 'sources.json').toString('utf8')),
    )
  for (const list of [reviewed, sources]) {
    const seen = new Set<string>()
    for (const entry of list) {
      const id = `${entry.name}@${entry.version}`
      if (seen.has(id)) {
        throw new Error(`Duplicate reviewed legal entry: ${id}`)
      }
      seen.add(id)
      selectedLicense(entry.license)
      assertProvenance(entry.sourceUrl)
    }
  }
  return { reviewed, sources }
}

function modulePackageRoot(moduleId: string) {
  const filename = moduleId.split(/[?#]/, 1)[0] ?? ''
  if (filename.split('/').some((part) => part === '..' || part === '.')) {
    throw new Error(`Module path traversal: ${moduleId}`)
  }
  const marker =
    filename.lastIndexOf('/node_modules/') + '/node_modules/'.length
  const parts = filename.slice(marker).split('/')
  const packageName = parts[0]?.startsWith('@')
    ? parts.slice(0, 2).join('/')
    : (parts[0] ?? '')
  return {
    filename,
    packageName,
    root: path.join(filename.slice(0, marker), packageName),
  }
}

function packageRoots(projectRoot: string, moduleIds: string[]): PackageRoot[] {
  const nodeModules = realpathSync(path.join(projectRoot, 'node_modules'))
  const roots = new Map<string, PackageRoot>()
  for (const moduleId of moduleIds) {
    if (moduleId.startsWith('\0') || !moduleId.includes('/node_modules/')) {
      continue
    }
    const { filename, packageName, root } = modulePackageRoot(moduleId)
    if (
      !isInside(nodeModules, realpathSync(root)) ||
      !isInside(realpathSync(root), realpathSync(filename))
    ) {
      throw new Error(
        `Module symlink escapes node_modules package: ${moduleId}`,
      )
    }
    const existing = roots.get(root)
    const metadata =
      existing?.metadata ??
      packageManifestSchema.parse(
        JSON.parse(readContainedFile(root, 'package.json').toString('utf8')),
      )
    if (metadata.name !== packageName) {
      throw new Error(`Invalid npm package root: ${root}`)
    }
    const modules = existing?.modules ?? new Set<string>()
    modules.add(path.relative(root, filename).split(path.sep).join('/'))
    roots.set(root, { root, metadata, modules })
  }
  if (!roots.size) {
    throw new Error('Empty bundled npm module inventory')
  }
  return [...roots.values()]
}

function reviewedDocuments(
  legalDir: string,
  review: ReviewedLicense | undefined,
): DocumentWithText[] {
  if (!review) {
    return []
  }
  return review.files.map((fallback) => {
    assertRelativeFile(fallback.originalPath)
    const contents = readContainedFile(
      path.join(legalDir, 'reviewed'),
      fallback.path,
    )
    assertDigest(contents, fallback.sha256, fallback.path)
    const sourceUrl = fallback.sourceUrl ?? review.sourceUrl
    assertProvenance(sourceUrl)
    return {
      path: `reviewed/${fallback.originalPath}`,
      sha256: fallback.sha256,
      sourceUrl,
      text: contents.toString('utf8'),
    }
  })
}

function completeStandardApache(
  legalDir: string,
  documents: DocumentWithText[],
  id: string,
) {
  const text = documents
    .map((document) => document.text)
    .join('\n')
    .replace(/\s+/g, ' ')
  if (/terms and conditions for use/i.test(text)) {
    return documents
  }
  if (
    !/copyright/i.test(text) ||
    !/licensed under the apache license, version 2\.0/i.test(text) ||
    !/https?:\/\/(?:www\.)?apache\.org\/licenses\/LICENSE-2\.0/i.test(text)
  ) {
    throw new Error(
      `Missing explicit standard Apache-2.0 notice or full license text: ${id}`,
    )
  }
  const contents = readContainedFile(
    legalDir,
    'reviewed/apache-2.0/LICENSE-2.0.txt',
  )
  const digest =
    'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30'
  assertDigest(contents, digest, 'canonical Apache-2.0 terms')
  return [
    ...documents,
    {
      path: 'standard/Apache-2.0.txt',
      sha256: digest,
      sourceUrl: 'https://www.apache.org/licenses/LICENSE-2.0.txt',
      text: contents.toString('utf8'),
    },
  ]
}

function reviewedProvenance(review: ReviewedLicense | undefined) {
  if (!review) {
    return undefined
  }
  const { sourceUrl, packageIntegrity, provenanceNote, provenanceUrl } = review
  return { sourceUrl, packageIntegrity, provenanceNote, provenanceUrl }
}

function metadataLicenseOf(metadata: PackageManifest): string | null {
  return typeof metadata.license === 'string'
    ? metadata.license
    : (metadata.license?.type ?? null)
}

function collectPackage(
  entry: PackageRoot,
  legalDir: string,
  reviewed: ReviewedLicense[],
  projectRoot: string,
): CollectedPackage {
  const { metadata, root, modules } = entry
  const id = `${metadata.name}@${metadata.version}`
  assertRuntimePackage(metadata.name)
  const metadataLicense = metadataLicenseOf(metadata)
  const review = reviewed.find(
    (item) => item.name === metadata.name && item.version === metadata.version,
  )
  const license = selectedLicense(metadataLicense ?? review?.license ?? null)
  if (review && license !== selectedLicense(review.license)) {
    throw new Error(`Reviewed license differs from installed metadata: ${id}`)
  }
  if (review) {
    assertReviewedIntegrity(projectRoot, review)
  }
  const originals = [
    ...legalDocuments(root),
    ...reviewedDocuments(legalDir, review),
  ]
  const documents = (
    license === 'Apache-2.0'
      ? completeStandardApache(legalDir, originals, id)
      : originals
  ).toSorted((a, b) => a.path.localeCompare(b.path, 'en'))
  if (
    !documents.some(
      (document) =>
        !document.path.includes('/') || document.path.startsWith('reviewed/'),
    )
  ) {
    throw new Error(`Missing root license text: ${id}`)
  }
  assertFullLicense(
    license,
    documents.map((document) => document.text),
    id,
  )
  const repository =
    typeof metadata.repository === 'string'
      ? metadata.repository
      : (metadata.repository?.url ?? null)
  const unscopedName = metadata.name.split('/').at(-1) ?? ''
  return {
    name: metadata.name,
    version: metadata.version,
    metadataLicense,
    selectedLicense: license,
    npm: `https://registry.npmjs.org/${metadata.name}/-/${unscopedName}-${metadata.version}.tgz`,
    repository,
    modules: [...modules].toSorted(),
    documents,
    reviewedLicense: reviewedProvenance(review),
  }
}

function collectSource(
  pkg: CollectedPackage,
  legalDir: string,
  sources: SourceFile[],
  projectRoot: string,
): CollectedSource | undefined {
  if (pkg.selectedLicense !== 'MPL-2.0') {
    return undefined
  }
  const source = sources.find(
    (entry) =>
      entry.name === pkg.name &&
      entry.version === pkg.version &&
      entry.license === pkg.selectedLicense,
  )
  if (!source) {
    throw new Error(`Missing matching MPL source: ${pkg.name}@${pkg.version}`)
  }
  assertReviewedIntegrity(projectRoot, source)
  const contents = readContainedFile(legalDir, source.path)
  assertDigest(contents, source.sha256, source.path)
  return {
    ...source,
    path: `third-party-sources/${path.posix.basename(source.path)}`,
    contents,
  }
}

export function collectPackageLicenses(
  projectRoot: string,
  moduleIds: string[],
) {
  const legalDir = path.join(projectRoot, 'tools/licenses')
  const { reviewed, sources } = readCatalogs(legalDir)
  const packages = new Map<string, CollectedPackage>()
  const collectedSources = new Map<string, CollectedSource>()
  for (const root of packageRoots(projectRoot, moduleIds)) {
    const pkg = collectPackage(root, legalDir, reviewed, projectRoot)
    const id = `${pkg.name}@${pkg.version}`
    const existing = packages.get(id)
    if (
      existing &&
      JSON.stringify(existing.documents) !== JSON.stringify(pkg.documents)
    ) {
      throw new Error(`Conflicting installed license copies: ${id}`)
    }
    if (existing) {
      pkg.modules = [
        ...new Set([...existing.modules, ...pkg.modules]),
      ].toSorted()
    }
    packages.set(id, pkg)
    const source = collectSource(pkg, legalDir, sources, projectRoot)
    if (source) {
      collectedSources.set(id, source)
    }
  }
  return {
    packages: [...packages.values()].toSorted((a, b) =>
      `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`, 'en'),
    ),
    sources: [...collectedSources.values()].toSorted((a, b) =>
      a.path.localeCompare(b.path, 'en'),
    ),
  }
}
