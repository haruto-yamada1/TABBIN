# Persistence Integrity Checker Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use test-driven-development to implement this plan task-by-task.

**Goal:** Add a pure Persistence Model v2 integrity checker and a separate typed repair-plan generator for Issue #712.

**Architecture:** Keep the Issue #725 entity contract in `PersistenceModelV2.ts`. Add two saved-tabs domain services: one for deterministic audit findings and one for dry-run repair planning. Export only pure functions, types, and invariant policy through the context public API.

**Tech Stack:** TypeScript, Vitest node project, TABBIN saved-tabs DDD domain, oxfmt, Oxlint.

---

### Task 1: Define corrupted snapshot behavior

**Files:**

- Create: `src/contexts/saved-tabs/domain/testing/persistenceV2IntegrityFixtures.ts`
- Create: `src/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker.test.ts`

1. Add a healthy snapshot fixture and focused corruptions for duplicate URL ID,
   duplicate normalized URL, dangling URL/collection/category/group relations,
   category mismatch, duplicate membership, orphans, invalid ordering,
   duplicate domain collection, timestamp relations, and non-JSON-safe data.
2. Write tests for `checkPersistenceIntegrity`, typed severity/repairability,
   deterministic finding order, and safe diagnostics.
3. Run
   `rtk bun run test:node -- src/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker.test.ts`
   and verify RED because the checker module does not exist.

### Task 2: Implement the pure checker

**Files:**

- Create: `src/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker.ts`
- Test: `src/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker.test.ts`

1. Define `IntegrityIssueSeverity`, `IntegrityRepairability`, the keyed finding
   detail map, `StorageIntegrityIssue`, and `StorageIntegrityReport`.
2. Define an exhaustive policy for every `PERSISTENCE_V2_INVARIANT_CODES`
   member so additions fail type-checking until policy is selected.
3. Implement index-building and each Issue #712 invariant as pure passes over
   the logical snapshot. Never normalize or mutate input records.
4. Run the focused node test and verify GREEN.
5. Refactor only while the focused test remains green.

### Task 3: Define and implement separated repair planning

**Files:**

- Create: `src/contexts/saved-tabs/domain/services/PersistenceRepairPlanner.test.ts`
- Create: `src/contexts/saved-tabs/domain/services/PersistenceRepairPlanner.ts`

1. Write failing tests proving metadata-equivalent duplicate membership creates
   one typed, destructive dry-run operation; metadata conflicts and other
   ambiguous findings remain unresolved; and orphan URLs never create removal
   operations.
2. Run the focused planner test and verify RED because the module is absent.
3. Implement `StorageRepairOperation`, `StorageRepairPlan`, and
   `createStorageRepairPlan` without executing or importing storage writes.
4. Run both Issue #712 test files and verify GREEN.

### Task 4: Publish the pure contract and document the handoff

**Files:**

- Modify: `src/contexts/saved-tabs/public-api.ts`
- Modify: `docs/architecture/persistence-model-v2.md`
- Test: `src/contexts/saved-tabs/domain/services/PersistenceIntegrityChecker.test.ts`
- Test: `src/contexts/saved-tabs/domain/services/PersistenceRepairPlanner.test.ts`

1. Export checker/planner pure functions and public types from the saved-tabs
   public API.
2. Document the audit -> plan -> review/backup -> repair -> re-audit boundary,
   safe diagnostics, and source-only adapter codes.
3. Run `rtk bun run compile` and the Issue #712 node tests.

### Task 5: Verify and publish

**Files:**

- Validate all Issue-owned paths.

1. Run `rtk bun run test:node`.
2. Run `rtk bun run test:coverage` and confirm 100% repository coverage.
3. Run `rtk bun run quality:check`.
4. Record harness checkpoints, run the fresh-context Evaluator, then run
   `rtk bun run harness:validate` and `rtk bun run harness:audit`.
5. Stage Issue-owned paths, commit in Japanese, and run the clean-tree
   `rtk bun run release:check`.
6. Push `codex/issue-712-persistence-integrity`, create an Open non-draft PR to
   `develop` with `Closes #712`, and live-verify PR and branch synchronization.
