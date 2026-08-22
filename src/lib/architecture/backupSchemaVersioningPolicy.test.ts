import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '..', '..', '..')
const versioningDocumentPath = resolve(
  repoRoot,
  'docs/architecture/backup-schema-versioning.md',
)
const persistenceModelDocument = readFileSync(
  resolve(repoRoot, 'docs/architecture/persistence-model-v2.md'),
  'utf8',
)

const readVersioningDocument = (): string =>
  existsSync(versioningDocumentPath)
    ? readFileSync(versioningDocumentPath, 'utf8')
    : ''

describe('Backup schema versioning architecture contract', () => {
  it('keeps the operational compatibility policy in an architecture document', () => {
    expect(existsSync(versioningDocumentPath)).toBe(true)
  })

  it('separates all version domains and typed failures', () => {
    const versioningDocument = readVersioningDocument()

    for (const contract of [
      '`appVersion`',
      '`schemaVersion`',
      '`databaseVersion`',
      '`UNSUPPORTED_FUTURE_SCHEMA`',
      '`UNSUPPORTED_SCHEMA_VERSION`',
      '`INVALID_SCHEMA`',
    ]) {
      expect(versioningDocument).toContain(contract)
    }
  })

  it('protects sequential validation and current-schema idempotence', () => {
    const versioningDocument = readVersioningDocument()

    for (const contract of [
      'input validation',
      'output validation',
      'current-schema idempotence',
    ]) {
      expect(versioningDocument).toContain(contract)
    }
  })

  it('keeps legacy compatibility in the temporary owning issues', () => {
    const versioningDocument = readVersioningDocument()

    for (const contract of ['2026-09-30', '#730', '#734']) {
      expect(versioningDocument).toContain(contract)
    }
  })

  it('links the detailed policy from Persistence Model v2', () => {
    expect(persistenceModelDocument).toContain(
      '[backup schema versioning](./backup-schema-versioning.md)',
    )
  })
})
