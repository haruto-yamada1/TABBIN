# Issue #711 Storage Concurrency Design

## Contract

Issue #711 is the Phase 0 writer-inventory and concurrency-analysis contract
for Persistence Model v2 Epic #724. It must document every current writer,
prove the boundary of module-local queues, prevent stale URL cache reads, and
hand durable requirements to #726, #727, #728, #738, and #739.

This change does not implement IndexedDB, live migration, source-of-truth
cutover, or a second long-lived transaction layer in `chrome.storage.local`.

## Current constraints

- `src/lib/storage/urls.ts` keeps both `urlRecordsCache` and
  `urlRecordMutationQueue` in module-global state.
- `src/lib/storage/projects.ts` and `src/lib/storage/tabs.ts` also contain
  module-local serialization paths, while multiple extension contexts can
  call the same storage modules independently.
- `urlRecordsCache` is invalidated by local write helpers and selected
  background paths, but there is no context-local `chrome.storage.onChanged`
  registration that guarantees invalidation after an external `urls` write.
- The current repository has implicit writers in startup migration,
  normalize-on-read/write-back, AI conversation loading, alarms, UI sync,
  import/restore, and cleanup paths.
- #726 owns the durable transaction model. Current-layer work must not create
  an overlapping revision or authoritative-writer architecture without proof
  that it is required before the v2 cutover.

## Considered approaches

### Evidence-first current-layer hardening — adopted

Create a complete, reviewable writer inventory with machine enforcement, fix
URL cache coherence, and add deterministic tests for same-runtime queues,
cross-context lost updates, and module restart. Treat the reproduced lost
update as an explicit current limitation and a transaction requirement for
#726 rather than hiding it behind another temporary persistence layer.

This is the smallest design that satisfies #711 without duplicating the v2
transaction and migration work.

### Wrap all legacy writers in Web Locks — rejected for #711

Web Locks are already used by a current migration path and can coordinate
same-origin contexts. Applying one lock to every legacy writer would still be
a broad runtime rewrite, would require migration/barrier semantics owned by
#727/#728, and would become a second transaction abstraction immediately
before #726.

### Route all writes through a background authoritative writer — rejected

Typed background commands could centralize mutation order, but all current
storage, repository, import, startup, alarm, and UI sync entrypoints would need
to be rerouted. Service-worker lifecycle and error recovery would become a new
temporary architecture that duplicates Persistence Model v2.

## Decisions

### Writer inventory is an authoritative Markdown artifact

Add `docs/architecture/current-storage-writer-inventory.md` with one row per
actual mutation path. Each row records:

- storage key and logical data;
- writer category and execution context;
- production entrypoint and final storage mutation boundary;
- read keys, write keys, and read-modify-write status;
- current queue/lock and cache participation;
- preflight and migration barrier participation;
- current change-notification expectation;
- Persistence Model v2 target owner.

The inventory covers explicit and implicit writers. Function names such as
`get`, `load`, or `read` are never accepted as evidence that a path is
read-only.

### Inventory coverage is enforced

Add a repository verifier and focused tests. The verifier scans production
files for direct or adapter-backed `chrome.storage.local` mutations and
requires every discovered mutation file to appear in the inventory. It also
requires the Issue #711 storage keys, writer categories, barrier columns, and
handoff targets.

The inventory remains the readable source of truth. The verifier does not
generate or rewrite it; a new writer intentionally fails the gate until the
inventory is reviewed and updated.

### URL cache coherence is context-local and event-driven

`getUrlRecords()` lazily resolves `chrome.storage.onChanged` and registers one
listener per module context. A local-area change containing `urls` invalidates
that context's cache. Writes continue to invalidate synchronously after a
successful `set`.

If the change API is unavailable, the function bypasses the cache instead of
returning data that can become permanently stale. Restart naturally discards
both the cache and listener; the first read in the restarted context reloads
storage and registers the new listener.

The listener carries no user data outside the extension and does not turn
change events into a source of truth.

### Race tests preserve the current guarantee boundary

Use isolated module imports sharing the same fake `chrome.storage.local` to
represent independent extension contexts.

- Concurrent mutations through one module are serialized and retain both
  updates.
- Two independent modules can read the same snapshot and reproduce the
  current lost-update limitation.
- A restarted module reads the committed storage state instead of inheriting
  queue or cache state.
- An external `urls` update invalidates the cache through `onChanged`.
- Without `onChanged`, reads bypass the cache and remain current.

The lost-update reproduction is evidence for #726; this Issue does not encode
the unsafe result as an accepted target behavior for v2.

### Handoff requirements are explicit

- #726: transactions must serialize cross-context read-modify-write across
  logical aggregate boundaries and must not rely on module lifetime.
- #727: bootstrap state and normal writers must consult one authoritative
  migration/control barrier.
- #728: every inventory row marked migration-participating must be blocked or
  coordinated during migration.
- #738: preflight must use raw, non-repairing readers and must become stale
  after a participating normal writer changes the source fingerprint.
- #739: change events are invalidation signals; consumers re-query the
  authoritative repository by scope.

## Error handling and security

- Storage read/write failures retain the existing typed/logged behavior; no
  retry or suppression is added.
- Listener unavailability disables caching instead of failing open to stale
  state.
- Inventory and tests contain paths, keys, and safe counts only. They do not
  log saved URLs, titles, notes, AI prompts, or conversation content.
- No permission or manifest change is required.

## Verification

- RED/GREEN tests for external cache invalidation and no-listener behavior.
- Deterministic same-context, cross-context, and restart concurrency tests.
- Verifier tests for required keys/categories and unlisted mutation files.
- Targeted node tests, full `test:coverage`, `quality:check`, and clean-tree
  `release:check` before publishing.
- Security review of storage, user-content, and event payload boundaries.

## Rollback

Reverting the cache listener restores the previous cache behavior. Reverting
the inventory and verifier removes only documentation enforcement. No stored
data shape, migration flag, permission, or source-of-truth decision changes,
so rollback requires no data migration.
