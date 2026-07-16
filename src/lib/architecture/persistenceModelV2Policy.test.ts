import { readFileSync } from 'node:fs'
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
})
