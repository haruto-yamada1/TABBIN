import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '..', '..', '..')
const modelDocument = readFileSync(
  resolve(repoRoot, 'docs/architecture/persistence-model-v2.md'),
  'utf8',
)

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
    const normalizedModelDocument = modelDocument.replace(/\s+/g, ' ')

    expect(modelDocument).toContain(
      '[current storage writer inventory](./current-storage-writer-inventory.md)',
    )

    for (const handoff of [
      '#726 owns v2 physical schema and connection lifecycle, use-case transaction boundaries, and cross-context write serialization.',
      '#727 owns the PersistenceBootstrap readiness barrier and cross-context migration coordination.',
      '#728 owns raw legacy snapshot parsing, pure v2 mapping, transactional target writes, read-back integrity verification, restart, and retry behavior.',
      '#738 owns read-only preflight, source fingerprints, and normal-write staleness invalidation.',
      '#739 owns post-commit cross-context change notification and invalidation, current `chrome.storage.onChanged` consumer migration, and re-query convergence.',
    ]) {
      expect(normalizedModelDocument).toContain(handoff)
    }

    expect(normalizedModelDocument).toContain(
      'module-local queues do not serialize writers in different extension contexts',
    )
    expect(normalizedModelDocument).toContain(
      'deterministically reproduces a two-context read-modify-write lost update',
    )
    expect(normalizedModelDocument).toContain(
      'Invalidation or a storage API transition advances the cache generation.',
    )
    expect(normalizedModelDocument).toContain(
      'A resolved read is cached only when that generation and the registered API identity are unchanged.',
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
