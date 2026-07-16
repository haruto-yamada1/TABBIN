# Issue #711 Storage Concurrency Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the current `chrome.storage` writer inventory, make URL cache reads coherent across extension contexts, and preserve deterministic evidence for queue, lost-update, restart, and migration handoff boundaries.

**Architecture:** Keep Markdown as the human/AI-readable writer-inventory source of truth and enforce it with a repository verifier. Add context-local `chrome.storage.onChanged` cache invalidation with cache bypass when the event API is unavailable. Reproduce current cross-context lost updates instead of adding a temporary transaction layer, and hand the durable guarantee to Persistence Model v2 Issues.

**Tech Stack:** TypeScript, Vitest, Bun, Chrome Extension Storage API, WXT, Markdown architecture documents.

---

### Task 1: Add the writer-inventory verifier core

**Files:**

- Create: `tools/scripts/verify-storage-writer-inventory.ts`
- Create: `tools/scripts/verify-storage-writer-inventory.test.ts`

**Step 1: Write the failing verifier tests**

Cover these behaviors with temporary fixture directories:

```ts
it('required storage keys and writer categories are mandatory', () => {
  expect(() => verifyStorageWriterInventory(fixture)).toThrow(
    /missing required storage key/i,
  )
})

it('a production storage mutation file must appear in the inventory', () => {
  expect(() => verifyStorageWriterInventory(fixture)).toThrow(
    /unlisted storage mutation file/i,
  )
})
```

Required keys include `savedTabs`, `urls`, `customProjects`,
`parentCategories`, `userSettings`, `aiChatConversations`, and
`savedAnalyticsViews`. Required categories include explicit mutation,
implicit repair, normalize-on-read, self-healing load, startup migration,
scheduled maintenance, UI sync, background listener, import/restore, and
cleanup.

**Step 2: Run the tests to verify RED**

Run:

```bash
bunx vitest run tools/scripts/verify-storage-writer-inventory.test.ts
```

Expected: FAIL because the verifier module does not exist.

**Step 3: Implement the minimal verifier**

Export pure helpers and a CLI entrypoint:

```ts
type StorageWriterInventoryVerificationOptions = {
  readonly repoRoot: string
  readonly inventoryPath: string
  readonly sourceRoots: readonly string[]
}

export const verifyStorageWriterInventory = (
  options: StorageWriterInventoryVerificationOptions,
): void => {
  // Parse the Markdown inventory, scan production files for storage mutation
  // boundaries, and throw a deterministic aggregate error for missing data.
}
```

Exclude tests, stories, generated output, and fixtures from the production
scan. Recognize direct `chrome.storage.local`, resolved `storageLocal`, and
Chrome storage repository port `set`/`remove` boundaries without matching
unrelated state setters.

**Step 4: Run the tests to verify GREEN**

Run the targeted Vitest command again.

Expected: both fixture tests PASS.

**Step 5: Commit**

```bash
git add tools/scripts/verify-storage-writer-inventory.ts tools/scripts/verify-storage-writer-inventory.test.ts
git commit -m "storage writer inventory検証を追加"
```

### Task 2: Build the authoritative current writer inventory

**Files:**

- Create: `docs/architecture/current-storage-writer-inventory.md`
- Modify: `tools/scripts/verify-storage-writer-inventory.test.ts`
- Modify: `package.json`

**Step 1: Add a repository-level failing test**

Call the verifier against the real repository before the inventory exists.

```ts
it('the repository inventory covers every current storage writer', () => {
  expect(() => verifyStorageWriterInventory(realRepoOptions)).not.toThrow()
})
```

**Step 2: Run the test to verify RED**

Expected: FAIL because the authoritative inventory is missing.

**Step 3: Inventory actual writer paths**

Create a Markdown table with these columns:

```text
ID | Storage key | Category | Context | Entry point | Mutation boundary |
Read keys | Write keys | RMW | Queue/lock | Cache | Preflight barrier |
Migration barrier | Change notification | v2 target
```

Trace every row to an actual storage `set`/`remove`, adapter mutation, or
repository save. Include direct and implicit paths in background startup,
domain/custom UI, normalization/write-back, AI conversation load, alarms,
import/restore, undo, cleanup/dedupe, settings, and analytics.

Add a file-coverage appendix listing every production mutation file discovered
by the verifier.

**Step 4: Add the repository gate**

Add:

```json
"verify:storage-writer-inventory": "bun tools/scripts/verify-storage-writer-inventory.ts"
```

Run it from `quality:check` before tests so a new unlisted writer fails fast.

**Step 5: Run the verifier and focused tests**

Run:

```bash
bun run verify:storage-writer-inventory
bunx vitest run tools/scripts/verify-storage-writer-inventory.test.ts
```

Expected: PASS with every required key/category and production mutation file
covered.

**Step 6: Commit**

```bash
git add docs/architecture/current-storage-writer-inventory.md tools/scripts/verify-storage-writer-inventory.test.ts package.json
git commit -m "current storage writerを一覧化"
```

### Task 3: Make URL cache invalidation cross-context safe

**Files:**

- Modify: `src/lib/storage/urls.ts`
- Modify: `src/lib/storage/urls.test.ts`

**Step 1: Write the failing cache-coherence tests**

Add tests proving:

```ts
it('external urls change invalidates the context-local cache', async () => {
  // First read caches A, the shared store becomes B, onChanged fires, next read
  // returns B.
})

it('reads bypass the cache when onChanged is unavailable', async () => {
  // Two reads around an external store change return current data both times.
})

it('registers only one urls listener per module context', async () => {
  // Multiple reads do not add duplicate listeners.
})
```

**Step 2: Run the targeted test to verify RED**

Run:

```bash
bunx vitest run src/lib/storage/urls.test.ts -t "cache"
```

Expected: the external-change and no-listener cases FAIL with stale data or a
missing listener.

**Step 3: Implement minimal cache coherence**

Use `getChromeStorageOnChanged()` from the browser boundary. Lazily register a
listener that invalidates only for `areaName === 'local'` and an own `urls`
change. Track the registered API object to avoid duplicate listeners.

`getUrlRecords()` may return the module cache only when listener registration
is available; otherwise it reads storage on every call.

**Step 4: Run the full URL storage tests**

Run:

```bash
bunx vitest run src/lib/storage/urls.test.ts
```

Expected: all URL tests PASS.

**Step 5: Commit**

```bash
git add src/lib/storage/urls.ts src/lib/storage/urls.test.ts
git commit -m "URL cacheを外部更新へ追従させる"
```

### Task 4: Add queue, race, and restart evidence

**Files:**

- Create: `src/lib/storage/urls.concurrency.test.ts`

**Step 1: Create isolated-context storage fixtures**

Use two independently imported `urls.ts` module instances sharing one fake
`chrome.storage.local` store. Add controllable read barriers so both contexts
can observe the same snapshot before either write commits.

**Step 2: Prove the same-runtime queue boundary**

```ts
it('one module queue serializes two URL mutations', async () => {
  // Two concurrent calls through one module retain both records.
})
```

Expected: PASS and final store length is 2.

**Step 3: Reproduce the cross-context lost update**

```ts
it('two module contexts reproduce the current lost-update limitation', async () => {
  // Both read the same empty snapshot and then write; final store demonstrates
  // that module-local queues are not a cross-context guarantee.
})
```

Expected: PASS with deterministic evidence that only one concurrent update
survives. The test description must identify this as a current limitation and
#726 requirement, not desired v2 behavior.

**Step 4: Prove restart behavior**

```ts
it('a restarted module reloads committed storage without queue state', async () => {
  // Commit A, import a fresh module context, commit B, and retain both.
})
```

Expected: PASS with final store length 2.

**Step 5: Run the evidence tests**

Run:

```bash
bunx vitest run src/lib/storage/urls.concurrency.test.ts
```

Expected: all queue/race/restart evidence PASS deterministically.

**Step 6: Commit**

```bash
git add src/lib/storage/urls.concurrency.test.ts
git commit -m "cross-context storage競合を再現する"
```

### Task 5: Record v2 handoffs and policy enforcement

**Files:**

- Modify: `docs/architecture/persistence-model-v2.md`
- Modify: `src/lib/architecture/persistenceModelV2Policy.test.ts`

**Step 1: Add failing policy expectations**

Require the architecture document to link the current writer inventory and to
contain explicit handoffs for #726, #727, #728, #738, and #739.

**Step 2: Run the policy test to verify RED**

Run:

```bash
bunx vitest run src/lib/architecture/persistenceModelV2Policy.test.ts
```

Expected: FAIL because the explicit inventory link and handoff contract are
not yet present.

**Step 3: Update the architecture handoff section**

Link `current-storage-writer-inventory.md`, state the reproduced current
lost-update limitation, and assign transaction, bootstrap, migration,
preflight-staleness, and notification guarantees to their owning Issues.

**Step 4: Run the policy test to verify GREEN**

Expected: PASS.

**Step 5: Commit**

```bash
git add docs/architecture/persistence-model-v2.md src/lib/architecture/persistenceModelV2Policy.test.ts
git commit -m "Persistence v2へ競合要件を引き渡す"
```

### Task 6: Verify, evaluate, and publish

**Files:**

- Update: `.agents/harness/runs/<run-id>/*.json` through harness commands only

**Step 1: Run targeted node tests**

```bash
bunx vitest run tools/scripts/verify-storage-writer-inventory.test.ts
bunx vitest run src/lib/storage/urls.test.ts
bunx vitest run src/lib/storage/urls.concurrency.test.ts
bunx vitest run src/lib/architecture/persistenceModelV2Policy.test.ts
```

Expected: all PASS.

**Step 2: Run security review checks**

Confirm no user content enters logs/events, no permission changes exist, cache
invalidation is scoped to `local.urls`, and inventory contains safe metadata
only.

**Step 3: Run repository gates**

```bash
bun run test:coverage
bun run quality:check
```

Expected: tests PASS; record the exact repository coverage rather than
claiming 100% if the baseline remains lower.

**Step 4: Run harness evaluation**

```bash
bun run harness:validate
bun run harness:audit
bun run harness:evaluate
```

Resolve `changes_requested` findings before publishing.

**Step 5: Review and commit any final scoped corrections**

Stage only Issue #711 paths and use a concise Japanese commit message.

**Step 6: Run the clean-tree release gate**

```bash
bun run release:check
```

Expected: PASS.

**Step 7: Push and create the Open PR**

Push `codex/issue-711-storage-concurrency` normally and create a non-Draft PR
to `develop` containing `Closes #711`, the acceptance mapping, exact tests,
coverage, risks, and handoffs.

**Step 8: Verify publication state**

Confirm the PR is Open, non-Draft, based on `develop`, and local/origin are
`0 0` ahead/behind.
