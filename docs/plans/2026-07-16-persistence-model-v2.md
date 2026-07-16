# Persistence Model v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Define the reviewed Persistence Model v2 contract required by Issue
#725 without implementing IndexedDB or changing current persistence behavior.

**Architecture:** Keep the logical contract in the saved-tabs domain layer and
the cross-context decisions in an architecture document. Encode URL identity,
ordering, JSON safety, and invariant names as pure TypeScript so #712 and #726
can consume the decisions without importing infrastructure.

**Tech Stack:** TypeScript, Vitest, Markdown, TABBIN DDD architecture

---

### Task 1: Add RED contract tests

**Files:**

- Create: `src/contexts/saved-tabs/domain/services/UrlIdentityPolicy.test.ts`
- Create: `src/contexts/saved-tabs/domain/entities/PersistenceModelV2.test.ts`
- Create: `src/lib/persistence/json-value.test.ts`
- Create: `src/lib/architecture/persistenceModelV2Policy.test.ts`

1. Define exact URL identity corpus expectations, including every Issue #725
   identity dimension.
2. Define JSON-safe acceptance/rejection cases, including circular values and
   semantic-loss values.
3. Define architecture-document and machine-readable invariant expectations.
4. Run the three tests and confirm they fail because the production artifacts
   do not exist.

### Task 2: Add the minimum domain contracts

**Files:**

- Create: `src/contexts/saved-tabs/domain/entities/PersistenceModelV2.ts`
- Create: `src/contexts/saved-tabs/domain/services/UrlIdentityPolicy.ts`
- Create: `src/contexts/saved-tabs/domain/services/urlIdentityCorpus.ts`
- Create: `src/lib/persistence/json-value.ts`

1. Add v2 entity and snapshot types with composite membership identity.
2. Add the exact-url-v1 policy and executable corpus.
3. Add gap-ordering constants and the #712 invariant-code union.
4. Add a recursive JSON-safe guard with circular-reference detection.
5. Run the focused tests until green.

### Task 3: Add the authoritative model document

**Files:**

- Create: `docs/architecture/persistence-model-v2.md`

1. Document entity responsibilities and current-to-v2 mapping.
2. Document URL identity, title conflict resolution, ordering, timestamps, and
   migration recoverability.
3. Add the complete Storage Placement Matrix, JSON-safe boundary, invariant
   catalogue, and query/projection boundary.
4. Map each Issue #725 acceptance criterion to an artifact or decision.
5. Run the policy test and focused domain tests.

### Task 4: Verify the repository contract

1. Run `bun run test:node` and `bun run compile`.
2. Run `bun run test:coverage` and confirm 100% coverage.
3. Run `bun run quality:check`.
4. Record harness checkpoints, run `harness:validate`, `harness:audit`, and a
   fresh-context evaluation.
5. Commit the Issue-owned files, then run clean-tree `bun run release:check`.

### Task 5: Publish

1. Push `codex/issue-725-persistence-model-v2` normally.
2. Create a non-draft PR against `develop` with `Closes #725`.
3. Verify the live PR state and local/origin branch synchronization.
