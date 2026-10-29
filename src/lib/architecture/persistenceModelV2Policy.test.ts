import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '..', '..', '..')
const modelDocument = readFileSync(
  resolve(repoRoot, 'docs/architecture/persistence-model-v2.md'),
  'utf8',
)
const inventoryDocumentPath = resolve(
  repoRoot,
  'docs/architecture/current-storage-writer-inventory.md',
)

type ContractSource = 'document' | 'verification'

type PersistenceHandoffContract = {
  readonly id: string
  readonly source: ContractSource
  readonly pattern: RegExp
  readonly mutation: RegExp
}

// Issue #861 retires Legacy migration ownership and Chrome URL-cache handoff
// claims. Keep mutation-tested protection for the supported runtime guarantees.
const persistenceHandoffContracts: readonly PersistenceHandoffContract[] = [
  {
    id: 'inventory.relative-link',
    source: 'document',
    pattern:
      /\[current storage writer inventory\]\(\.\/current-storage-writer-inventory\.md\)/,
    mutation: /current-storage-writer-inventory\.md/,
  },
  {
    id: 'runtime.indexeddb-only-domain-authority',
    source: 'document',
    pattern: /IndexedDB the only domain-data source/i,
    mutation: /only domain-data source/i,
  },
  {
    id: 'runtime.storage-independent-startup',
    source: 'document',
    pattern:
      /without consulting legacy Chrome Storage records or migration state/i,
    mutation:
      /without consulting legacy Chrome Storage records or migration state/i,
  },
  {
    id: 'runtime.no-dormant-user-restoration',
    source: 'document',
    pattern:
      /data remaining only in old Chrome Storage domain keys is not migrated or restored automatically/i,
    mutation: /is not migrated or restored automatically/i,
  },
  {
    id: 'runtime.schema-upgrades-remain-supported',
    source: 'document',
    pattern: /database schema upgrades/i,
    mutation: /database schema upgrades/i,
  },
  {
    id: 'backup.current-format-only',
    source: 'document',
    pattern:
      /Backup compatibility remains limited to the current Backup V2 format/i,
    mutation: /limited to the current Backup V2 format/i,
  },
  {
    id: 'native.aggregate-transaction-boundaries',
    source: 'verification',
    pattern: /use-case-sized, multi-store IndexedDB transactions/i,
    mutation: /use-case-sized, multi-store IndexedDB transactions/i,
  },
  {
    id: 'native.revision-guards',
    source: 'verification',
    pattern: /revision checks/i,
    mutation: /revision checks/i,
  },
  {
    id: 'native.decoding-and-integrity-admission',
    source: 'verification',
    pattern: /record decoding, logical projection, and integrity admission/i,
    mutation: /integrity admission/i,
  },
  {
    id: 'backup.shared-resource-safety-and-recovery',
    source: 'verification',
    pattern:
      /Backup V2 schema, resource metrics, JSON safety, and overwrite recovery/i,
    mutation: /overwrite recovery/i,
  },
  {
    id: 'notifications.safe-metadata-only',
    source: 'verification',
    pattern: /Post-commit notifications carry safe metadata only/i,
    mutation: /safe metadata only/i,
  },
  {
    id: 'notifications.restart-convergence',
    source: 'verification',
    pattern:
      /missed, duplicate, or out-of-order events and restarts converge by reading current records/i,
    mutation: /restarts converge/i,
  },
  {
    id: 'verification.chrome-firefox-install-update',
    source: 'verification',
    pattern:
      /New-install and already-migrated restart\/update smoke tests exercise Chrome and Firefox/i,
    mutation: /smoke tests exercise Chrome and Firefox/i,
  },
]

const normalizeProse = (value: string): string => value.replace(/\s+/g, ' ')

const tolerateMarkdownWrapping = (pattern: RegExp): RegExp =>
  new RegExp(pattern.source.replaceAll(' ', String.raw`\s+`), pattern.flags)

const extractHandoffSection = (document: string): string | undefined => {
  const heading = '## Current ownership and verification'
  const start = document.indexOf(heading)
  if (start < 0) {
    return undefined
  }

  const remaining = document.slice(start + heading.length)
  const nextHeading = remaining.search(/^## /m)
  return nextHeading < 0 ? remaining : remaining.slice(0, nextHeading)
}

const resolveContractSource = (
  document: string,
  contractSource: ContractSource,
): string | undefined => {
  if (contractSource === 'document') {
    return document
  }

  return extractHandoffSection(document)
}

const removeContractConcept = (
  document: string,
  contract: PersistenceHandoffContract,
): string => {
  const source = resolveContractSource(document, contract.source)
  if (!source) {
    return document
  }

  const mutatedSource = source.replace(
    tolerateMarkdownWrapping(contract.mutation),
    '',
  )
  if (mutatedSource === source) {
    return document
  }

  const sourceStart = document.indexOf(source)
  return `${document.slice(0, sourceStart)}${mutatedSource}${document.slice(sourceStart + source.length)}`
}

const collectPersistenceHandoffContractFailures = (
  document: string,
): readonly string[] => {
  const failures: string[] = []

  for (const contract of persistenceHandoffContracts) {
    const source = resolveContractSource(document, contract.source)

    if (!source || !contract.pattern.test(normalizeProse(source))) {
      failures.push(`missing persistence handoff contract: ${contract.id}`)
    }
  }

  return failures
}

describe('Persistence Model v2 architecture contract', () => {
  it('keeps every required model decision in the authoritative document', () => {
    for (const heading of [
      '## Aggregate boundary',
      '## Target model',
      '## URL identity policy',
      '## Ordering policy',
      '## Timestamp semantics',
      '## Historical Chrome Storage to v2 mapping',
      '## Storage Placement Matrix',
      '## Incognito data boundary',
      '## JSON-safe persistence boundary',
      '## Backup V2 resource and round-trip envelope',
      '## Historical migration recoverability',
      '## IndexedDB readiness and recovery',
      '## Current ownership and verification',
      '## Invariants for #712',
      '## Query and projection boundary',
    ]) {
      expect(modelDocument).toContain(heading)
    }
  })

  it('decides current placement for every domain, settings and UI data class', () => {
    for (const dataClass of [
      'Saved URLs',
      'Saved tabs / custom projects',
      'Parent categories',
      '`userSettings`',
      'AI conversation history',
      '`activeAiChatConversationId`',
      'Analytics views',
      '`viewMode`',
      '`seenVersion` / `changelogShown`',
      'Recovery snapshots',
    ]) {
      expect(modelDocument.toLowerCase()).toContain(dataClass.toLowerCase())
    }
    expect(modelDocument).toContain('`storage` permission')
    expect(modelDocument).not.toContain('要決定')
  })

  it('records the data-loss and serialization guardrails', () => {
    for (const guardrail of [
      'exact-url-v1',
      'URL_IDENTITY_COLLISION',
      'URL_TITLE_CONFLICT',
      'MISSING_TIMESTAMP_PROVENANCE',
      'NON_JSON_SAFE_VALUE',
      "DynamicToolUIPart['input']",
      "DynamicToolUIPart['output']",
    ]) {
      expect(modelDocument).toContain(guardrail)
    }
  })

  it('defines the supported Backup V2 resource and round-trip contract', () => {
    for (const contract of [
      '128 MiB',
      '100,000 URLs',
      '500,000 memberships',
      '32 MiB attachment aggregate',
      '8 MiB tool-trace aggregate',
      'import(export(x))',
      'validateBackupResourceUsage',
      'BACKUP_FILE_TOO_LARGE',
      'BACKUP_RESOURCE_LIMIT_EXCEEDED',
      'BACKUP_NESTED_PAYLOAD_TOO_LARGE',
      'INVALID_BACKUP',
      '90.49 MiB',
      'compact JSON',
      'two recovery snapshots for seven days',
    ]) {
      expect(modelDocument).toContain(contract)
    }
  })

  it('defines one normal-only scope for every private browsing boundary', () => {
    const normalizedModelDocument = normalizeProse(modelDocument)

    for (const contract of [
      /current manifests omit `incognito` and therefore use the browser default `spanning` mode/i,
      /Chrome shares `chrome\.storage\.local` between regular and incognito processes/i,
      /Firefox requires user opt-in for private browsing access/i,
      /"incognito": "not_allowed"/i,
      /Database identity, readiness, operation coordination, and recovery are normal-context-only/i,
      /Backup V2 exports and imports normal-context data only/i,
      /Analytics and AI saved-URL context builders consume normal-context data only/i,
      /normal-context guard rejects unsupported private contexts before any/i,
    ]) {
      expect(normalizedModelDocument).toMatch(contract)
    }
  })

  it('protects supported transactions, integrity and restart convergence in the current contract', () => {
    expect(collectPersistenceHandoffContractFailures(modelDocument)).toEqual([])
    expect(existsSync(inventoryDocumentPath)).toBe(true)
  })

  it('reports a deterministic failure when any protected handoff concept is removed', () => {
    for (const contract of persistenceHandoffContracts) {
      const mutatedDocument = removeContractConcept(modelDocument, contract)
      expect({
        contractId: contract.id,
        mutationApplied: mutatedDocument !== modelDocument,
      }).toEqual({ contractId: contract.id, mutationApplied: true })

      const expectedFailure = `missing persistence handoff contract: ${contract.id}`
      const firstFailures =
        collectPersistenceHandoffContractFailures(mutatedDocument)
      const secondFailures =
        collectPersistenceHandoffContractFailures(mutatedDocument)
      expect(firstFailures).toEqual(secondFailures)
      expect(firstFailures).toEqual([expectedFailure])
    }
  })

  it('protects current post-commit restart convergence independently', () => {
    const withoutRestartConvergence = modelDocument.replace(
      /restarts\s+converge/i,
      '',
    )
    expect(
      collectPersistenceHandoffContractFailures(withoutRestartConvergence),
    ).toContain(
      'missing persistence handoff contract: notifications.restart-convergence',
    )
  })

  it('uses camelCase for the shared persistence utility filename', () => {
    expect(
      existsSync(resolve(repoRoot, 'src/lib/persistence/jsonValue.ts')),
    ).toBe(true)
    expect(
      existsSync(resolve(repoRoot, 'src/lib/persistence/json-value.ts')),
    ).toBe(false)
  })
})
