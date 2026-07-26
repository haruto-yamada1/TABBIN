# Issue #727 PersistenceBootstrap Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use test-driven-development and execute each
> behavior RED, GREEN, then refactor.

**Goal:** Guarantee migration readiness and fail-closed persistence routing at
repository and persistence-facade boundaries across extension contexts.

**Architecture:** Persist one typed control-plane state in
`chrome.storage.local`, protect it with a Web Locks shared/exclusive barrier, and
require all legacy/IndexedDB operations to execute through a route-aware gate.
Actual legacy-to-v2 mapping remains behind a #728 lifecycle port.

**Tech Stack:** TypeScript, Vitest, Chrome Extensions storage API, Web Locks,
fake-indexeddb, WXT, Oxlint, dependency-cruiser.

---

### Task 1: Control-state contract and transition policy

**Files:**

- Create: `src/contexts/saved-tabs/application/ports/PersistenceBootstrapPort.ts`
- Create: `src/contexts/saved-tabs/application/services/PersistenceControlStateService.ts`
- Test: `src/contexts/saved-tabs/application/services/PersistenceControlStateService.test.ts`

1. Write tests for decoding every state, absent-state compatibility, invalid
   stored values, the allowed transition matrix, migration-ID mismatch, and
   read-only emergency source.
2. Run the test and verify RED because the contract/service is absent.
3. Add the discriminated unions, error codes, transition commands, and pure
   transition function.
4. Run the test and verify GREEN.

### Task 2: Trusted control-state storage

**Files:**

- Create: `src/contexts/saved-tabs/infrastructure/persistence/control-plane/ChromePersistenceControlStateRepository.ts`
- Test: `src/contexts/saved-tabs/infrastructure/persistence/control-plane/ChromePersistenceControlStateRepository.test.ts`
- Modify: `src/lib/browser/chrome-storage.ts`

1. Write failing tests that require `TRUSTED_CONTEXTS`, default missing data to
   `legacy`, persist only valid transitions, reject invalid stored state, reject
   access-policy failures, and allow an explicitly verified no-content-script
   capability when `setAccessLevel` is unavailable.
2. Implement the repository and access-policy adapter with injected raw storage
   and manifest readers.
3. Run the focused test and verify GREEN.

### Task 3: Cross-context coordination

**Files:**

- Create: `src/contexts/saved-tabs/infrastructure/browser/WebLocksPersistenceCoordinationAdapter.ts`
- Test: `src/contexts/saved-tabs/infrastructure/browser/WebLocksPersistenceCoordinationAdapter.test.ts`

1. Write failing tests for shared concurrency, exclusive waiting, callback
   lifetime, operation-error preservation, and missing/rejected capability.
2. Implement one stable lock name and typed fail-closed errors.
3. Run the focused test and verify GREEN.

### Task 4: Bootstrap recovery and operation gate

**Files:**

- Create: `src/contexts/saved-tabs/application/services/PersistenceBootstrapService.ts`
- Test: `src/contexts/saved-tabs/application/services/PersistenceBootstrapService.test.ts`
- Create: `src/contexts/saved-tabs/application/services/PersistenceOperationGateService.ts`
- Test: `src/contexts/saved-tabs/application/services/PersistenceOperationGateService.test.ts`

1. Write RED tests for same-context single-flight, background-first,
   options-first, simultaneous contexts, restart from `verifying` and
   `cutover-pending`, failed migration/verification, retry, and completed state.
2. Implement bootstrap orchestration around injected lifecycle callbacks and
   persisted transitions.
3. Write RED tests for the full route matrix and state re-read under the shared
   lock.
4. Implement legacy/IndexedDB read/write gate methods and verify GREEN.

### Task 5: Composition and persistence-facade wiring

**Files:**

- Create: `src/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime.ts`
- Test: `src/contexts/saved-tabs/infrastructure/composition/persistenceBootstrapRuntime.test.ts`
- Modify: `src/app/composition/createSavedTabsRepositories.ts`
- Modify: `src/contexts/saved-tabs/infrastructure/composition/createSavedTabsUseCasesDeps.ts`
- Modify: `src/contexts/saved-tabs/public-api.ts`
- Modify gated legacy persistence files identified by
  `docs/architecture/current-storage-writer-inventory.md`

1. Write a failing composition test proving repository read/write callbacks do
   not execute until ready and are rejected during migration/read-only state.
2. Build one per-context runtime singleton; retain module state only for
   single-flight optimization.
3. Expose gated legacy storage through the saved-tabs public API and route the
   writer-inventory production files through it.
4. Verify current behavior remains GREEN in focused node/DOM tests.

### Task 6: Require the gate for IndexedDB adapters

**Files:**

- Modify: `src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork.ts`
- Modify: `src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbSavedTabsQueryAdapter.ts`
- Modify: `src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader.ts`
- Modify their colocated tests and benchmark composition.

1. Add RED tests showing each public read/write entry rejects a mismatched route
   before opening IndexedDB.
2. Require a `PersistenceOperationGatePort` constructor dependency and hold the
   shared gate for each logical adapter operation.
3. Run focused IndexedDB tests and the Chromium/Firefox IndexedDB smoke test when
   local browser binaries are available.

### Task 7: Inventory enforcement and documentation

**Files:**

- Modify: `docs/architecture/persistence-model-v2.md`
- Modify: `docs/architecture/indexeddb-persistence.md`
- Modify: `docs/architecture/current-storage-writer-inventory.md`
- Create: `src/lib/architecture/persistenceBootstrapPolicy.test.ts`

1. Add a RED policy test for the Issue's URL, saved-tabs, collection, import /
   export, analytics, AI context, cleanup, context-menu, and background paths.
2. Document authoritative state, storage classification, route matrix,
   Chrome/Firefox access policy, and #739 separation.
3. Make the architecture test GREEN without weakening lint or test rules.

### Task 8: Verification and publication

1. Run focused tests during every RED/GREEN cycle.
2. Run `bun run test:node`, relevant DOM/E2E or browser smoke tests,
   `bun run test:coverage`, and `bun run quality:check`.
3. Run `bun run harness:checkpoint`, `bun run harness:validate`,
   `bun run harness:audit`, and a fresh-context Evaluator.
4. Stage only Issue-owned paths, commit with a Japanese summary, and run the
   clean-tree `bun run release:check`.
5. Push `codex/issue-727-persistence-bootstrap` and create an Open, non-Draft PR
   to `develop` with `Closes #727`.
6. Re-read PR state and branch synchronization before reporting completion.
