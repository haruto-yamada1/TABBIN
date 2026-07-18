# IndexedDB persistence infrastructure

Status: implemented infrastructure contract for Issue #726
Parent: #724
Logical model: `docs/architecture/persistence-model-v2.md`

## Scope and ownership

This layer stores Persistence Model v2 without making IndexedDB part of the
domain or application API. Application ports define write plans, commit
results, snapshots, and projections. The adapter under
`src/contexts/saved-tabs/infrastructure/persistence/indexed-db/` is the only
layer in this flow that refers to `IDBDatabase`, `IDBTransaction`, or
`IDBObjectStore`.

Issue #726 does not:

- read or transform legacy `chrome.storage.local` data (#728);
- switch the production source of truth or remove legacy keys (#729);
- implement the cross-context notification transport (#739);
- define the public Backup V2 mapper (#730); or
- implement recovery snapshot retention and restore (#740).

`userSettings`, active AI selection, release controls, and migration controls
remain in `chrome.storage.local` as decided by the #725 Storage Placement
Matrix. No cross-engine atomic transaction is claimed for those records.

## Database and schema version

The database name is `tabbin-persistence-v2`. Its physical schema version is
`PERSISTENCE_DATABASE_VERSION = 1`. This integer is independent of both the
extension app version and the public backup `schemaVersion`.

Upgrade work runs only in `onupgradeneeded`. A legacy Chrome Storage migration
must never be placed in this callback; it is a separate, coordinated operation
owned by #728.

## Object stores, keys, and indexes

| Store                   | Key                     | Secondary indexes                                                                                          | Policy                                                                                      |
| ----------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `urls`                  | `id`                    | `normalizedUrl`, `firstSavedAt`, `lastSavedAt`                                                             | `normalizedUrl` is deliberately non-unique until #738 proves source collisions are handled. |
| `collections`           | `id`                    | `definition.type`, unique `definition.domain`, `groupId`, `createdAt`, `updatedAt`, `[groupId, sortOrder]` | Domain collections have one canonical domain; Custom records have no domain index entry.    |
| `collectionMemberships` | `[collectionId, urlId]` | `collectionId`, `urlId`, `[collectionId, categoryId]`, `[collectionId, sortOrder]`, `addedAt`              | The composite key is the #725 logical identity and prevents duplicate membership.           |
| `collectionCategories`  | `id`                    | `collectionId`, `[collectionId, sortOrder]`                                                                | Category ownership remains explicit.                                                        |
| `collectionGroups`      | `id`                    | `sortOrder`                                                                                                | Group ordering is indexed without requiring contiguous ranks.                               |
| `conversations`         | `id`                    | `updatedAt`                                                                                                | Context-owned mapper supplies a JSON-safe value; the store does not own AI domain rules.    |
| `messages`              | `id`                    | `conversationId`, `[conversationId, createdAt]`, `createdAt`                                               | Messages are queryable without loading a conversation blob.                                 |
| `analyticsViews`        | `id`                    | `updatedAt`                                                                                                | Context-owned JSON-safe projection.                                                         |
| `recoverySnapshots`     | `id`                    | `createdAt`, `expiresAt`                                                                                   | Physical placement only; retention and restore remain #740.                                 |
| `metadata`              | `key`                   | none                                                                                                       | Internal monotonic revision; not part of Backup V2.                                         |

Arbitrary runtime values are not accepted merely because structured clone can
store them. Every complete write-plan record is validated as `JsonValue` before
opening a transaction, so non-finite numbers, `Date`, `undefined`, custom
prototypes, symbols, and extra non-JSON fields are rejected. Read decoders repeat
the whole-record JSON-safe check before returning any store value. Raw URL,
title, notes, AI prompt, attachment content, or snapshot payload must not appear
in logs or change events.

## Transaction boundary

The caller completes all work that can suspend or change business meaning
before constructing `PersistenceV2WritePlan`:

- Chrome API and legacy/backup reads;
- schema parsing and validation;
- normalization and integrity checks;
- ID and Clock acquisition;
- business decisions; and
- target write-plan construction.

`IndexedDbPersistenceUnitOfWork.commit()` then queues only IndexedDB requests.
The low-level queue callback is synchronous. If it returns a Promise, the
transaction is aborted with `IndexedDbExternalAsyncTransactionError`. This
prevents `fetch`, `chrome.*`, timers, async ID generation, or other external
awaits from being inserted between IndexedDB requests and making the
transaction inactive.

All stores touched by one use case plus `metadata` are opened in one
`readwrite` transaction. A constraint, clone, quota, explicit abort, or request
error rolls back every store. The revision read, `N -> N + 1` write, and domain
mutations are part of the same transaction.

The Promise resolves only on the transaction `complete` event and returns:

```ts
type PersistenceCommitResult = {
  readonly revision: number
  readonly changedScopes: readonly PersistenceChangeScope[]
}
```

This result is the boundary consumed by #739. The transaction adapter does not
publish messages. An orchestrator may publish only after `commit()` resolves;
an abort produces no commit result. A later publish failure does not pretend
that committed data or its revision was rolled back.

Change scopes are logical invalidation scopes, not physical object-store names.
A `messages` mutation therefore reports `conversations`, matching the #739
conversation aggregate scope so consumers requery the complete conversation.

## Durability and browser behavior

Normal mutations use the browser's `default` durability. Critical migration,
import, or recovery work may explicitly request `strict`; cache-like data may
request `relaxed`. There is no silent fallback from an explicitly requested
mode.

The W3C IndexedDB specification defines durability as a hint: `strict` normally
requests an operating-system buffer flush before `complete`, but user agents
may weigh the hint against performance and power costs. Therefore `strict` is
not documented as a power-loss guarantee. The adapter treats `complete` as the
application commit boundary and does not require explicit `transaction.commit()`.

The repository smoke test runs the same native contract in Playwright Chromium
and Firefox. On 2026-07-18, both projects reported `strict`, exposed
`commit()`, rolled back an aborted record, and delivered `versionchange` so the
old connection could close. The spec records the historical support difference:
`commit()` arrived in Chrome 76 / Firefox 74, while the durability attribute
arrived in Chrome 82 / Firefox 126. Current supported browsers therefore share
the required surface, but the durability effect remains implementation-defined.

References:

- [W3C transaction lifecycle](https://w3c.github.io/IndexedDB/#transaction-lifecycle)
- [W3C transaction scheduling](https://w3c.github.io/IndexedDB/#transaction-scheduling)
- [W3C IDBTransaction API](https://w3c.github.io/IndexedDB/#transaction)

## Connection lifecycle

Each extension context owns one `IndexedDbConnectionManager` instance:

1. concurrent `open()` calls share one in-flight Promise;
2. a successful connection is reused in that context;
3. `versionchange` closes and forgets the old connection immediately;
4. `blocked` reports the old and requested versions without hiding the upgrade;
5. an explicit close invalidates an in-flight open and forgets the cached
   connection; and
6. a new manager after an MV3 service-worker restart opens the same database.

An upgrade exception aborts the upgrade transaction and becomes a typed
`UPGRADE_FAILED` connection error. A normal open failure is classified
separately as `OPEN_FAILED`.

## Consistent snapshot and integrity

`IndexedDbPersistenceSnapshotReader.readConsistentSnapshot()` queues `getAll()`
for all IndexedDB-backed Backup V2 source stores in one `readonly` transaction:

```text
urls + collections + memberships + categories + groups
+ conversations + messages + analyticsViews
```

`metadata` is internal and `recoverySnapshots` is an internal recovery artifact,
so neither is exported. Chrome-storage settings cannot join an IndexedDB
transaction; #730 must combine that independently owned configuration with the
atomic IndexedDB logical snapshot without claiming cross-engine atomicity.

All IDB requests are queued before awaiting completion. Integrity checking,
deterministic ordering, mapping, compression, and JSON serialization occur only
after the transaction completes. Both the backup-facing logical snapshot and
`readVerifiedSavedTabsSnapshot()` run the #712 checker after materialization and
throw `PersistenceSnapshotIntegrityError` for an unhealthy graph. No public
snapshot-reader path can bypass relation integrity. It never creates placeholder
URLs or silently repairs broken relations.

## Query projections and N+1 policy

UI and feature code consume `PersistenceV2QueryPort`, not object stores. The
IndexedDB query adapter reads the five saved-tabs stores as one snapshot, builds
URL/category/collection maps once, groups Memberships once, and creates:

- Saved Tabs initial-load projections;
- Collection + Membership + URL + Category projections;
- collections under a group;
- collections containing one URL; and
- analytics URL records.

It never performs one URL request per Membership. Missing relations are typed
integrity failures, not UI-generated fallback records.

## Scale fixtures and migration decision

`persistenceBenchmarkFixtures.ts` fixes the Issue #726 matrices:

- migration: 1k / 10k / 50k / 100k URLs with 1x / 3x / 10x Memberships;
- query: 10k/50k, 50k/250k, and 100k/500k URL/Membership pairs; and
- AI persistence: small / medium / large conversation-message profiles.

`bun run benchmark:persistence` records normalize, JSON parse, integrity check,
IDB write, logical snapshot read-back, Saved Tabs initial load, collection open,
analytics query, AI saved-URL context build, serialized size, and observed heap
delta. The benchmark includes deterministic conversation/message records from
the selected AI profile. It uses `fake-indexeddb` as an implementation-regression
baseline; the separate Playwright smoke owns native browser semantics.

Initial Bun 1.3.14 baseline on 2026-07-18 (machine-specific, not a release
threshold):

All rows below include 10 conversations / 100 messages.

| URLs / Memberships |      write | read-back | initial load | collection | analytics | AI context | integrity | observed heap delta |
| ------------------ | ---------: | --------: | -----------: | ---------: | --------: | ---------: | --------: | ------------------: |
| 1,000 / 3,000      |   101.0 ms |    8.9 ms |      10.2 ms |     6.6 ms |    5.7 ms |     6.1 ms |    3.2 ms |             10.6 MB |
| 10,000 / 30,000    | 1,058.2 ms |   31.2 ms |      51.9 ms |    47.6 ms |   45.3 ms |    43.0 ms |   20.3 ms |            102.6 MB |
| 10,000 / 50,000    | 1,737.3 ms |   82.4 ms |      74.0 ms |    75.2 ms |   67.4 ms |    60.5 ms |   26.0 ms |            128.9 MB |

The decision is deliberately split:

- normal use-case mutations remain one atomic transaction;
- Issue #726 does not authorize an unconditional all-record migration
  transaction; and
- #728 must keep a resumable migration plan and may select a single transaction
  only for a measured source profile that passes the full Chromium/Firefox
  matrix, #735 capacity headroom, restart tests, and the no-2x-regression review
  gate against a recorded baseline.

No absolute time threshold is guessed here. A future result at least 2x its
comparable baseline requires release review and an updated recorded decision.

## Verification commands

```text
bun run test:node
bun run test:indexeddb:browsers
bun run benchmark:persistence -- --url-count=10000 --membership-multiplier=5
bun run test:coverage
bun run quality:check
bun run release:check
```
