# Issue #739 Persistence Invalidation Design

## Contract

Issue #739 introduces the cross-context invalidation protocol required before
Persistence Model v2 becomes the domain-data source of truth in #729. The
protocol must notify open extension contexts after a successful IndexedDB
commit without turning the notification into a second source of truth.

The protocol carries only a generated change identifier, the committed
IndexedDB revision, and the changed persistence scopes. Consumers use that
information only to decide whether to run the relevant Repository or Query
again.

This change does not perform the source-of-truth cutover, migrate legacy data,
or replace the current UI projection with Persistence Model v2. The existing
`StorageChangePort` remains the compatibility path until #729 replaces the
legacy domain read and write paths.

## Confirmed constraints

- #725 defines the normalized Url, Collection, Membership, Category, and Group
  boundaries and keeps small settings in the Chrome Storage control plane.
- #726 increments the internal revision in the same IndexedDB transaction as
  the domain mutations and resolves `commit()` only after transaction
  completion.
- A transaction abort must never publish an event.
- A notification failure must never make committed data appear rolled back.
- Event payloads must not contain URLs, titles, notes, prompts, attachments, or
  other domain data.
- Duplicate, stale, out-of-order, and missed events are normal transport
  conditions. Correctness comes from querying current IndexedDB state.
- Polling IndexedDB object stores is not the standard synchronization path.
- Chrome and Firefox must use the same JSON-safe event contract.

## Transport decision

### Selected: BroadcastChannel

A dedicated BroadcastChannel adapter implements `PersistenceChangePort`.
Extension pages and workers under the same extension origin can subscribe to a
named channel without maintaining a long-lived connection. Publishing does
not require a response and having no active subscriber is a valid outcome.

The adapter validates every inbound event at the infrastructure boundary. It
uses a channel factory so tests can model independent background and page
contexts without relying on process-global state. Unsubscribing removes the
listener and closes the subscriber channel.

BroadcastChannel is an invalidation transport, not durable storage. A stopped
service worker is not expected to replay old messages when it starts again.
Initial load and focus recovery compare the current IndexedDB revision instead.

### Rejected: runtime.sendMessage

One-time runtime messaging reaches extension contexts, but its request and
response lifecycle is unnecessary for a best-effort invalidation hint.
Listener absence and response handling also produce browser-version-dependent
promise or error behavior that the protocol would need to special-case.

### Rejected: Chrome Storage marker

A control-plane key would reuse `storage.onChanged` and leave a persistent
write for every IndexedDB commit. It would also retain the transport dependency
that #739 is intended to replace for domain data. The persisted marker would
still not be authoritative and would not remove the need for revision checks.

### Rejected: hybrid or long-lived Port

Combining transports adds ordering and duplicate-delivery cases without
improving correctness. A long-lived Port also couples correctness to connection
lifetime across page suspension and MV3 service-worker restarts.

## Application contract

`PersistenceChangeScope` remains aligned with the write-plan scopes established
by #726, including `recoverySnapshots`. Settings are not assigned an IndexedDB
revision because #725 keeps them in Chrome Storage.

```ts
type PersistenceChangeEvent = {
  readonly changeId: string
  readonly revision: number
  readonly scopes: readonly PersistenceChangeScope[]
}

type PersistenceChangePort = {
  readonly publish: (event: PersistenceChangeEvent) => Promise<void>
  readonly subscribe: (
    listener: (event: PersistenceChangeEvent) => void,
  ) => () => void
}
```

The scope type moves to the change-port contract and is imported by the Unit of
Work contract. This keeps commit results and events on one scope vocabulary.

## Post-commit publication

An application coordinator owns the ordered boundary:

```text
validate write plan
  -> IndexedDB transaction
  -> transaction complete
  -> committed revision and scopes
  -> generate changeId
  -> publish invalidation event
```

The coordinator is explicit rather than a transparent Unit of Work decorator.
Its result distinguishes these states:

- the commit failed and no event was published;
- the commit succeeded and the event was published; or
- the commit succeeded but notification failed.

The last state carries a typed, redacted diagnostic and the successful commit
result. Callers must not retry the mutation as though IndexedDB rolled back.
The next initial-load, focus, or explicit revision check repairs the missed
notification.

`IdGeneratorPort` creates the change identifier after commit completion. The
revision remains the authoritative ordering value; `changeId` supports
diagnostics and duplicate transport observations only.

## Consumer algorithm

A scope-aware invalidation coordinator is independent of React and browser
globals. Each consumer supplies:

- the scopes relevant to that consumer;
- a current revision reader;
- a Query callback that returns data from a consistent IndexedDB snapshot and
  the snapshot revision; and
- an apply callback for the refreshed projection.

The coordinator subscribes before its initial Query so a commit cannot be lost
between initial read and listener registration. Events received during an
in-flight Query are coalesced by highest revision.

```text
unrelated scopes
  -> ignore

event revision <= last observed revision
  -> duplicate or stale; ignore

new relevant revision
  -> Query current snapshot
  -> apply current projection
  -> advance last observed revision
```

Initial load always queries current state. Focus recovery first reads the
current revision and re-queries only when it is newer than the last applied
snapshot. Explicit refresh always queries current state. Event revisions are
not replayed as an event log.

Saved Tabs observes `urls`, `collections`, `memberships`, `categories`, and
`groups`. Analytics observes `urls`, `collections`, and `memberships`. AI saved
URL context reads current data on its next tool or Query boundary. Settings keep
their existing control-plane change path until their dedicated migration.

## Legacy migration boundary

The current `StorageChangePort`, `ChromeStorageChangeAdapter`, and
`syncStorageChanges` operate on legacy storage DTOs. #739 documents but does not
force them to read empty pre-cutover IndexedDB stores.

For #729:

- legacy domain-key branches are removed from `syncStorageChanges` after the
  v2 projection becomes authoritative;
- Saved Tabs domain refresh uses the scope-aware invalidation coordinator;
- settings change handling moves behind a settings-specific control-plane
  boundary; and
- presentation receives refresh intents, not two storage-engine concepts.

## Error handling and security

- Inbound events are schema-validated and unknown messages are ignored.
- Invalid revisions, empty or unknown scopes, and malformed identifiers do not
  reach consumers.
- The channel name is extension-internal and the payload remains JSON-safe even
  though BroadcastChannel uses structured cloning.
- Diagnostics contain error codes, revisions, and scopes only. They never copy
  domain records or raw transport payloads.
- Publication failure is observable but cannot roll back or conceal a committed
  transaction.

## Test strategy

TDD starts with the smallest contract tests and expands to one composed flow:

1. port and schema tests reject sensitive or malformed payload shapes;
2. BroadcastChannel adapter tests cover publish, subscribe, unsubscribe, and
   independent contexts;
3. post-commit coordinator tests prove commit-before-publish, abort-without-
   publish, and typed notification failure after a successful commit;
4. invalidation coordinator tests cover relevant scopes, unrelated scopes,
   duplicate and stale revisions, in-flight coalescing, missed-event focus
   recovery, explicit refresh, and unsubscribe;
5. a background-to-open-Saved-Tabs regression test composes real fake-indexeddb
   persistence, the Query adapter, and independent channel contexts to prove
   that committed state is re-queried rather than read from the event;
6. service-worker restart is modeled by closing and recreating the publisher,
   then converging through the current revision;
7. Chrome and Firefox production builds plus an extension smoke exercise verify
   the shared transport surface.

Repository-wide `test:coverage`, `quality:check`, and clean-tree
`release:check` remain the publication gates.

## Rollback

The protocol is additive before #729. Removing its composition leaves the
current Chrome Storage synchronization path unchanged. IndexedDB commits remain
valid if a notification is missed, and revision-aware reload or focus recovery
restores the current projection without migrating or deleting user data.
