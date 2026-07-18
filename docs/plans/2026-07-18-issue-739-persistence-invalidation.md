# Issue #739 Persistence Invalidation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
> implement this plan task-by-task.

**Goal:** Publish JSON-safe cross-context invalidation hints only after an
IndexedDB commit and make scope-aware consumers re-query current state while
remaining correct after duplicate, stale, or missed events.

**Architecture:** A BroadcastChannel infrastructure adapter implements a new
`PersistenceChangePort`. An application coordinator sequences Unit of Work
commit and best-effort publication with an explicit partial-success outcome.
A second application coordinator filters revisions and scopes, serializes
re-queries, and recovers missed events from the current IndexedDB revision.

**Tech Stack:** TypeScript, Zod, IndexedDB/fake-indexeddb, BroadcastChannel,
Vitest, WXT, Playwright.

---

### Task 1: Define the persistence change contract

**Files:**

- Create:
  `src/contexts/saved-tabs/application/ports/PersistenceChangePort.ts`
- Modify:
  `src/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort.ts`
- Modify: `src/contexts/saved-tabs/dddLayerGuard.test.ts`

**Step 1: Write the failing architecture test**

Add a guard that expects a `PersistenceChangePort` application contract and
expects the Unit of Work port to import the shared `PersistenceChangeScope`
instead of owning a duplicate union.

The contract must expose only:

```ts
type PersistenceChangeEvent = {
  readonly changeId: string
  readonly revision: number
  readonly scopes: readonly PersistenceChangeScope[]
}
```

It must not contain domain-record fields such as `url`, `title`, `notes`,
`prompt`, `attachment`, or `payload`.

**Step 2: Run the test to verify RED**

Run:

```bash
bunx vitest run src/contexts/saved-tabs/dddLayerGuard.test.ts
```

Expected: FAIL because `PersistenceChangePort.ts` does not exist.

**Step 3: Add the minimal port contract**

Move `PersistenceChangeScope` to the new port file, retain the exact #726 scope
union, and add `PersistenceChangeEvent` plus `publish`/`subscribe`.

**Step 4: Run the test to verify GREEN**

Run the same Vitest command. Expected: PASS.

**Step 5: Commit**

```bash
git add src/contexts/saved-tabs/application/ports/PersistenceChangePort.ts \
  src/contexts/saved-tabs/application/ports/PersistenceV2UnitOfWorkPort.ts \
  src/contexts/saved-tabs/dddLayerGuard.test.ts
git commit -m "feat: persistence change port を定義"
```

### Task 2: Implement the BroadcastChannel adapter

**Files:**

- Create:
  `src/contexts/saved-tabs/infrastructure/browser/BroadcastChannelPersistenceChangeAdapter.test.ts`
- Create:
  `src/contexts/saved-tabs/infrastructure/browser/BroadcastChannelPersistenceChangeAdapter.ts`

**Step 1: Write failing adapter tests**

Use an injected in-memory channel factory to prove:

- a publisher in one context reaches a subscriber in another context;
- the sender does not need a response or subscriber;
- unsubscribe removes the listener and closes the subscriber channel;
- malformed inbound objects are ignored;
- unknown/empty scopes and non-positive revisions are ignored;
- events contain no domain data; and
- `postMessage` failure becomes `PersistenceChangePublicationError` with a
  stable code and without copying the raw payload.

**Step 2: Run the tests to verify RED**

Run:

```bash
bunx vitest run \
  src/contexts/saved-tabs/infrastructure/browser/BroadcastChannelPersistenceChangeAdapter.test.ts
```

Expected: FAIL because the adapter does not exist.

**Step 3: Implement the minimal adapter**

Define a narrow injected channel interface. Validate inbound events with Zod,
copy the validated event before delivering it, and close only channels owned by
the subscription being removed. Keep the production default factory behind
`globalThis.BroadcastChannel` and throw a typed unavailable error when the API
does not exist.

**Step 4: Run the tests to verify GREEN**

Run the same Vitest command. Expected: PASS with no warnings.

**Step 5: Commit**

```bash
git add src/contexts/saved-tabs/infrastructure/browser/BroadcastChannelPersistenceChangeAdapter.*
git commit -m "feat: BroadcastChannel invalidation adapter を追加"
```

### Task 3: Sequence commit and publication explicitly

**Files:**

- Create:
  `src/contexts/saved-tabs/application/services/PersistenceMutationCoordinator.test.ts`
- Create:
  `src/contexts/saved-tabs/application/services/PersistenceMutationCoordinator.ts`

**Step 1: Write failing coordinator tests**

Use deterministic Unit of Work, change-port, and `IdGeneratorPort` fakes to
prove:

- `publish` receives the committed revision and scopes after `commit` resolves;
- a rejected commit never generates an identifier or publishes;
- a rejected publish returns `commit_succeeded_notification_failed` together
  with the successful commit result;
- a successful publish returns `committed_and_published`; and
- publication failure never asks the Unit of Work to commit twice.

**Step 2: Run the tests to verify RED**

Run:

```bash
bunx vitest run \
  src/contexts/saved-tabs/application/services/PersistenceMutationCoordinator.test.ts
```

Expected: FAIL because the coordinator does not exist.

**Step 3: Implement the minimal coordinator**

Expose a factory whose `commit()` returns a discriminated outcome. Let commit
errors reject unchanged. Catch only the post-commit publication error and
return it as a typed diagnostic outcome with revision and scopes.

**Step 4: Run the tests to verify GREEN**

Run the same Vitest command. Expected: PASS.

**Step 5: Commit**

```bash
git add src/contexts/saved-tabs/application/services/PersistenceMutationCoordinator.*
git commit -m "feat: commit 後の invalidation publish を調停"
```

### Task 4: Make v2 query snapshots revision-aware

**Files:**

- Modify:
  `src/contexts/saved-tabs/application/ports/PersistenceV2QueryPort.ts`
- Modify:
  `src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbSavedTabsQueryAdapter.ts`
- Modify:
  `src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader.test.ts`

**Step 1: Write the failing projection test**

Extend the initial-load Query test to expect the revision returned by the same
consistent snapshot as the projected collections and groups.

**Step 2: Run the test to verify RED**

Run:

```bash
bunx vitest run \
  src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader.test.ts
```

Expected: FAIL because `readInitialLoad()` omits `revision`.

**Step 3: Return the snapshot revision**

Add `revision` to `PersistenceV2InitialProjection` and map it directly from the
consistent snapshot. Do not perform a second metadata read.

**Step 4: Run the test to verify GREEN**

Run the same Vitest command. Expected: PASS.

**Step 5: Commit**

```bash
git add src/contexts/saved-tabs/application/ports/PersistenceV2QueryPort.ts \
  src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbSavedTabsQueryAdapter.ts \
  src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceSnapshotReader.test.ts
git commit -m "feat: initial projection に revision を含める"
```

### Task 5: Implement scope- and revision-aware invalidation

**Files:**

- Create:
  `src/contexts/saved-tabs/application/services/PersistenceInvalidationCoordinator.test.ts`
- Create:
  `src/contexts/saved-tabs/application/services/PersistenceInvalidationCoordinator.ts`

**Step 1: Write failing consumer tests**

Prove the coordinator:

- subscribes before initial Query;
- applies the initial current snapshot;
- re-queries for a newer relevant event;
- ignores unrelated scopes and stale/duplicate revisions;
- coalesces events received during an in-flight Query;
- checks current revision on focus and recovers a missed event;
- skips the Query when the focus revision has not advanced;
- always re-queries on explicit refresh; and
- stops all later work after dispose.

**Step 2: Run the tests to verify RED**

Run:

```bash
bunx vitest run \
  src/contexts/saved-tabs/application/services/PersistenceInvalidationCoordinator.test.ts
```

Expected: FAIL because the coordinator does not exist.

**Step 3: Implement serialized refresh scheduling**

Track `lastObservedRevision`, `highestPendingRevision`, the active refresh
promise, and a disposed flag inside the coordinator instance. Event handlers
only schedule work; one serialized loop reads and applies current snapshots.
Expose `start`, `checkCurrentRevision`, `refresh`, and `dispose`.

**Step 4: Run the tests to verify GREEN**

Run the same Vitest command. Expected: PASS with deterministic ordering.

**Step 5: Commit**

```bash
git add src/contexts/saved-tabs/application/services/PersistenceInvalidationCoordinator.*
git commit -m "feat: revision aware invalidation coordinator を追加"
```

### Task 6: Prove background-to-Saved-Tabs convergence

**Files:**

- Create:
  `src/contexts/saved-tabs/infrastructure/persistence/persistenceChangeFlowRegression.test.ts`
- Modify as required:
  `src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork.test.ts`

**Step 1: Write the failing composed regression test**

Compose:

- one fake-indexeddb database;
- a real `IndexedDbPersistenceUnitOfWork` and snapshot/query adapters;
- independent background and Saved Tabs BroadcastChannel adapters;
- the mutation coordinator; and
- the invalidation coordinator applying a Saved Tabs projection.

Start the page on an empty projection, commit Url/Collection/Membership records
from the background coordinator, and assert that the page Query returns the new
projection. Assert that the event contains no entity data.

Add a second case that drops the event, recreates the writer context, and
converges when the page performs a current-revision check.

**Step 2: Run the test to verify RED**

Run:

```bash
bunx vitest run \
  src/contexts/saved-tabs/infrastructure/persistence/persistenceChangeFlowRegression.test.ts
```

Expected: FAIL until all composition seams are connected.

**Step 3: Add only the missing composition support**

Keep the test on v2 Query DTOs. Do not wire the current legacy SavedTabsApp to
empty pre-cutover stores and do not add a Chrome Storage fallback.

**Step 4: Run the regression group to verify GREEN**

Run:

```bash
bunx vitest run \
  src/contexts/saved-tabs/infrastructure/persistence/persistenceChangeFlowRegression.test.ts \
  src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/contexts/saved-tabs/infrastructure/persistence/persistenceChangeFlowRegression.test.ts \
  src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork.test.ts
git commit -m "test: cross-context persistence convergence を検証"
```

### Task 7: Document the protocol and migration boundary

**Files:**

- Create: `docs/architecture/persistence-change-invalidation.md`
- Modify: `docs/architecture/indexeddb-persistence.md`
- Modify: `docs/architecture/ddd.md`
- Modify: `docs/architecture/current-storage-writer-inventory.md`
- Modify: `docs/security/permissions.md`

**Step 1: Define a failing documentation pressure check**

Use targeted repository searches to record the missing protocol, consumer
matrix, legacy migration policy, privacy payload rule, and Chrome/Firefox
transport table before editing.

**Step 2: Add the authoritative protocol document**

Document transport selection, event schema, post-commit semantics, publication
failure outcome, consumer scopes, revision convergence, cache policy,
service-worker restart behavior, legacy `StorageChangePort` removal point, and
the absence of a new extension permission.

**Step 3: Synchronize existing architecture surfaces**

Link the new document from IndexedDB and DDD docs, update writer-inventory
notification targets, and explain why no web-accessible resource or permission
is added.

**Step 4: Verify the documentation pressure check**

Run targeted `rg` commands and `git diff --check`. Expected: every required
contract is discoverable and no whitespace error remains.

**Step 5: Commit**

```bash
git add docs/architecture/persistence-change-invalidation.md \
  docs/architecture/indexeddb-persistence.md docs/architecture/ddd.md \
  docs/architecture/current-storage-writer-inventory.md \
  docs/security/permissions.md
git commit -m "docs: persistence invalidation protocol を明文化"
```

### Task 8: Run browser and repository gates

**Files:**

- Modify only if a gate finds an Issue-owned defect.

**Step 1: Run focused and project tests**

```bash
bun run test:node
bun run test
```

Expected: all tests PASS.

**Step 2: Run Chrome and Firefox production builds**

```bash
bun run build
bun run build:firefox
```

Expected: both builds PASS and require no new manifest permission.

If the existing E2E harness supports the BroadcastChannel extension-context
scenario without test-only production hooks, use the `e2e-testing` skill and
add the smallest smoke. Otherwise record the composed regression plus both
production builds as the browser evidence.

**Step 3: Run repository-wide gates**

```bash
bun run test:coverage
bun run quality:check
```

Expected: 100% coverage and all quality stages PASS.

**Step 4: Validate and audit the Harness run**

```bash
bun run harness:validate
bun run harness:audit
```

Expected: schemas valid and no unresolved completion finding.

**Step 5: Record final implementation commit if needed**

Stage only Issue-owned paths and create a scoped Japanese commit. Confirm the
worktree is clean afterward.

### Task 9: Publish the Issue branch and Open PR

**Files:** none.

**Step 1: Run clean-tree release verification**

```bash
bun run release:check
```

Expected: PASS from a clean tree.

**Step 2: Push normally**

```bash
git push -u origin codex/issue-739-persistence-invalidation
```

Expected: local branch and origin are synchronized.

**Step 3: Create the Open PR**

Create or reuse the one matching Open PR with base `develop`, non-Draft state,
root cause, changes, acceptance mapping, tests, risks, and `Closes #739`.

**Step 4: Verify live publication state**

Confirm the PR is OPEN, `isDraft: false`, base `develop`, and the local HEAD
matches the remote head.
