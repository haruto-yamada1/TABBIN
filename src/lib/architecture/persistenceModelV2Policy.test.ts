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

type ContractSource = 'document' | 'handoff' | `issue:${number}`

type PersistenceHandoffContract = {
  readonly id: string
  readonly source: ContractSource
  readonly pattern: RegExp
  readonly mutation: RegExp
}

const persistenceHandoffContracts: readonly PersistenceHandoffContract[] = [
  {
    id: 'inventory.relative-link',
    source: 'document',
    pattern:
      /\[current storage writer inventory\]\(\.\/current-storage-writer-inventory\.md\)/,
    mutation:
      /\[current storage writer inventory\]\(\.\/current-storage-writer-inventory\.md\)/,
  },
  {
    id: 'current.module-local-cross-context-caveat',
    source: 'handoff',
    pattern:
      /module-local queues do not serialize writers in different extension contexts/i,
    mutation:
      /module-local queues do not serialize writers in different extension contexts/i,
  },
  {
    id: 'current.two-context-lost-update',
    source: 'handoff',
    pattern:
      /deterministically reproduces a two-context read-modify-write lost update/i,
    mutation:
      /deterministically reproduces a two-context read-modify-write lost update/i,
  },
  {
    id: 'current.restart-reloads-durable-storage',
    source: 'handoff',
    pattern: /recreated module reloads durable storage.*module globals/i,
    mutation:
      /recreated module reloads durable storage instead of depending on module globals/i,
  },
  {
    id: 'url-cache.urls-only-scope',
    source: 'handoff',
    pattern: /For `urls` only/i,
    mutation: /For `urls` only/i,
  },
  {
    id: 'url-cache.own-local-scope',
    source: 'handoff',
    pattern: /own local `chrome\.storage\.onChanged` event/i,
    mutation: /own local `chrome\.storage\.onChanged` event/i,
  },
  {
    id: 'url-cache.lazy-initial-registration',
    source: 'handoff',
    pattern: /lazily subscribes/i,
    mutation: /lazily subscribes/i,
  },
  {
    id: 'url-cache.api-transition-reregistration',
    source: 'handoff',
    pattern: /re-registers its listener.*API object changes/i,
    mutation:
      /removes and re-registers its listener when the available API object changes/i,
  },
  {
    id: 'url-cache.api-unavailable-bypass',
    source: 'handoff',
    pattern: /bypasses the cache when the API is unavailable/i,
    mutation: /bypasses the cache when the API is unavailable/i,
  },
  {
    id: 'url-cache.generation-advance',
    source: 'handoff',
    pattern:
      /Invalidation or a storage API transition advances the cache generation/i,
    mutation:
      /Invalidation or a storage API transition advances the cache generation/i,
  },
  {
    id: 'url-cache.in-flight-api-identity-guard',
    source: 'handoff',
    pattern:
      /resolved read is cached only when.*generation.*registered API identity.*unchanged/i,
    mutation:
      /resolved read is cached only when that generation and the registered API identity are unchanged/i,
  },
  {
    id: 'url-cache.no-general-concurrency-guarantee',
    source: 'handoff',
    pattern:
      /does not provide cross-context transactional read-modify-write.*general writers/i,
    mutation:
      /does not provide cross-context transactional read-modify-write, migration readiness, or preflight-fingerprint guarantees for general writers/i,
  },
  {
    id: '726.physical-schema',
    source: 'issue:726',
    pattern: /physical schema/i,
    mutation: /v2 physical schema/i,
  },
  {
    id: '726.connection-lifecycle',
    source: 'issue:726',
    pattern: /connection lifecycle/i,
    mutation: /connection lifecycle/i,
  },
  {
    id: '726.use-case-transaction-boundaries',
    source: 'issue:726',
    pattern: /use-case transaction boundaries/i,
    mutation: /use-case transaction boundaries/i,
  },
  {
    id: '726.cross-context-write-serialization',
    source: 'issue:726',
    pattern: /cross-context write serialization/i,
    mutation: /cross-context write serialization/i,
  },
  {
    id: '727.persistence-bootstrap-readiness',
    source: 'issue:727',
    pattern: /PersistenceBootstrap readiness barrier/i,
    mutation: /PersistenceBootstrap readiness barrier/i,
  },
  {
    id: '727.cross-context-migration-coordination',
    source: 'issue:727',
    pattern: /cross-context migration coordination/i,
    mutation: /cross-context migration coordination/i,
  },
  {
    id: '727.all-domain-paths-use-barrier',
    source: 'issue:727',
    pattern: /Every domain read\/write participates in this barrier/i,
    mutation: /Every domain read\/write participates in this barrier/i,
  },
  {
    id: '728.raw-legacy-snapshot',
    source: 'issue:728',
    pattern: /raw legacy snapshot parsing/i,
    mutation: /raw legacy snapshot parsing/i,
  },
  {
    id: '728.pure-v2-mapping',
    source: 'issue:728',
    pattern: /pure v2 mapping/i,
    mutation: /pure v2 mapping/i,
  },
  {
    id: '728.transactional-target-writes',
    source: 'issue:728',
    pattern: /transactional target writes/i,
    mutation: /transactional target writes/i,
  },
  {
    id: '728.read-back-integrity',
    source: 'issue:728',
    pattern: /read-back integrity verification/i,
    mutation: /read-back integrity verification/i,
  },
  {
    id: '728.restart-and-retry',
    source: 'issue:728',
    pattern: /restart.*retry behavior/i,
    mutation: /restart, and retry behavior/i,
  },
  {
    id: '738.read-only-preflight',
    source: 'issue:738',
    pattern: /read-only preflight/i,
    mutation: /read-only preflight/i,
  },
  {
    id: '738.source-fingerprints',
    source: 'issue:738',
    pattern: /source fingerprints/i,
    mutation: /source fingerprints/i,
  },
  {
    id: '738.normal-write-staleness',
    source: 'issue:738',
    pattern: /normal-write staleness invalidation/i,
    mutation: /normal-write staleness invalidation/i,
  },
  {
    id: '738.raw-non-repairing-reader',
    source: 'issue:738',
    pattern: /raw non-repairing reader/i,
    mutation: /raw non-repairing reader/i,
  },
  {
    id: '739.post-commit-notification-invalidation',
    source: 'issue:739',
    pattern: /post-commit cross-context change notification and invalidation/i,
    mutation: /post-commit cross-context change notification and invalidation/i,
  },
  {
    id: '739.on-changed-consumer-migration',
    source: 'issue:739',
    pattern: /`chrome\.storage\.onChanged` consumer migration/i,
    mutation: /`chrome\.storage\.onChanged` consumer migration/i,
  },
  {
    id: '739.invalidate-and-requery',
    source: 'issue:739',
    pattern: /invalidate and re-query current persistence state/i,
    mutation: /invalidate and re-query current persistence state/i,
  },
  {
    id: '739.missed-duplicate-out-of-order',
    source: 'issue:739',
    pattern: /Missed.*duplicate.*out-of-order events/i,
    mutation: /Missed, duplicate, out-of-order events/i,
  },
]

const normalizeProse = (value: string): string => value.replace(/\s+/g, ' ')

const tolerateMarkdownWrapping = (pattern: RegExp): RegExp =>
  new RegExp(pattern.source.replaceAll(' ', String.raw`\s+`), pattern.flags)

const extractHandoffSection = (document: string): string | undefined => {
  const heading = '## Handoff and review gates'
  const start = document.indexOf(heading)
  if (start < 0) {
    return undefined
  }

  const remaining = document.slice(start + heading.length)
  const nextHeading = remaining.search(/^## /m)
  return nextHeading < 0 ? remaining : remaining.slice(0, nextHeading)
}

const extractIssueBullet = (
  handoffSection: string,
  issueNumber: number,
): string | undefined => {
  const lines = handoffSection.split('\n')
  const start = lines.findIndex((line) => line.startsWith(`- #${issueNumber} `))
  if (start < 0) {
    return undefined
  }

  let end = start + 1
  while (
    end < lines.length &&
    lines[end].trim() !== '' &&
    !lines[end].startsWith('- #')
  ) {
    end += 1
  }
  return lines.slice(start, end).join('\n')
}

const collectPersistenceHandoffContractFailures = (
  document: string,
): readonly string[] => {
  const failures: string[] = []
  const handoffSection = extractHandoffSection(document)

  for (const contract of persistenceHandoffContracts) {
    let source: string | undefined
    if (contract.source === 'document') {
      source = document
    } else if (contract.source === 'handoff') {
      source = handoffSection
    } else {
      const issueNumber = Number(contract.source.slice('issue:'.length))
      source = handoffSection
        ? extractIssueBullet(handoffSection, issueNumber)
        : undefined
    }

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
      '## Current to v2 mapping',
      '## Storage Placement Matrix',
      '## JSON-safe persistence boundary',
      '## Migration recoverability',
      '## Invariants for #712',
      '## Query and projection boundary',
    ]) {
      expect(modelDocument).toContain(heading)
    }
  })

  it('decides placement for every Issue #725 data class', () => {
    for (const dataClass of [
      '`urls`',
      '`savedTabs`',
      '`customProjects`',
      '`userSettings`',
      '`aiChatConversations`',
      '`activeAiChatConversationId`',
      '`savedAnalyticsViews`',
      '`viewMode`',
      '`seenVersion` / `changelogShown`',
      'migration control state',
      'notice dismissals',
      'recovery snapshots',
    ]) {
      expect(modelDocument).toContain(dataClass)
    }
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

  it('hands current concurrency limitations to the owning v2 issues', () => {
    expect(collectPersistenceHandoffContractFailures(modelDocument)).toEqual([])
    expect(existsSync(inventoryDocumentPath)).toBe(true)
  })

  it('reports a deterministic failure when any protected handoff concept is removed', () => {
    for (const contract of persistenceHandoffContracts) {
      const mutatedDocument = modelDocument.replace(
        tolerateMarkdownWrapping(contract.mutation),
        '',
      )
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
      expect(firstFailures).toContain(expectedFailure)
    }
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
