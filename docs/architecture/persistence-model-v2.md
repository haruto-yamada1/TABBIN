# Persistence Model v2

Analytics timestamp and query semantics are defined in
[analytics-metrics.md](./analytics-metrics.md).

Status: current IndexedDB-only contract after Issue #861
Parent: Issue #724

This document is authoritative for the logical Persistence Model v2 and its
current storage placement. The TypeScript model is in
`src/contexts/saved-tabs/domain/entities/PersistenceModelV2.ts`; executable URL
identity examples are in `urlIdentityCorpus.ts`.

Issue #861 makes IndexedDB the only domain-data source for saved tabs, projects,
categories, AI conversation history, and analytics views. New installations and
already migrated profiles initialize the same database without consulting
legacy Chrome Storage records or migration state. The previous dormant-user
automatic migration guarantee is retired: data remaining only in old Chrome
Storage domain keys is not migrated or restored automatically. Existing
IndexedDB records, database schema upgrades, integrity checks, and Backup V2
recovery remain supported. No legacy-key cleanup or whole-storage deletion runs.

The historical #728 conversion rules remain in
[`legacy-persistence-v2-migration.md`](legacy-persistence-v2-migration.md) for
interpretation of previously migrated records; they are not an active runtime
path. Backup compatibility remains limited to the current Backup V2 format.

The quota, eviction, permission, capacity admission, typed failure, and recovery
boundary is defined by
[`persistence-durability.md`](../security/persistence-durability.md)
and the executable contract in `src/lib/persistence/capacity.ts`. IndexedDB
and Backup V2 adapters consume this shared boundary.

## Aggregate boundary

The normalized saved-tabs aggregate consists of `Url`, `Collection`,
`CollectionMembership`, `CollectionCategory`, and `CollectionGroup`.

- The aggregate contract lives in `contexts/saved-tabs/domain`; it does not
  depend on Chrome Storage or IndexedDB.
- Domain and Custom are `Collection.definition` variants, not separate storage
  aggregates.
- Settings, AI conversations, analytics views, release controls, UI state,
  and recovery snapshots retain their own context ownership. The
  Storage Placement Matrix decides their engine and authority without making
  them saved-tabs domain entities.
- Shared JSON serialization rules live in `src/lib/persistence/jsonValue.ts`.
  A context-specific persistence mapper must convert runtime values to that
  shared boundary.
- Infrastructure may store several aggregates in one IndexedDB database, but
  database co-location does not merge their domain ownership.

## Target model

The source types use a `PersistenceV2` prefix to avoid collision with the
current `Url` string value object during the staged migration. The logical names
below remain `Url`, `Collection`, `CollectionMembership`,
`CollectionCategory`, and `CollectionGroup`.

### Url

```ts
type Url = {
  readonly id: string
  readonly url: string
  readonly normalizedUrl: string
  readonly title: string
  readonly favIconUrl?: string
  readonly firstSavedAt: number
  readonly lastSavedAt: number
  readonly updatedAt: number
}
```

`Url` owns canonical URL metadata. `title` and `favIconUrl` occur once per URL;
there is no collection-specific title override. `normalizedUrl` is the
versioned identity key defined below, not an invitation to apply ad-hoc URL
cleanup.

### CollectionDefinition and Collection

```ts
type CollectionDefinition =
  | {
      readonly type: 'domain'
      readonly domain: string
    }
  | {
      readonly type: 'custom'
      readonly projectKeywords: ProjectKeywordSettings
    }

type Collection = {
  readonly id: string
  readonly name: string
  readonly definition: CollectionDefinition
  readonly groupId?: string
  readonly sortOrder: number
  readonly uncategorizedCategoryPosition?: number
  readonly createdAt: number
  readonly updatedAt: number
}
```

A domain collection uses the same canonical hostname policy as
`normalizeDomainString`; duplicate canonical domains are invalid. A custom
collection owns project keyword settings. `Collection.groupId` is the only
authoritative parent-group relation.

`sortOrder` is included because current Domain/Custom UI order is user data.
`updatedAt` changes only when collection definition or metadata changes; adding
a URL does not change it.

`uncategorizedCategoryPosition` is an optional non-negative safe-integer
insertion index among the collection's ordered child categories. It preserves
the position of the implicit Uncategorized bucket, whose memberships have no
`categoryId`; it does not create a `CollectionCategory` record. An absent field
places that bucket last, preserving existing IndexedDB records and Backup V2
files. An index greater than the current child-category count also appends the
bucket without inventing categories. Negative, fractional, unsafe, and
non-number positions are invalid collection ordering; explicitly present
`undefined` and other non-JSON-safe values remain invalid. The optional record
field needs no IndexedDB store or index change: database version 1 and Backup V2
schema version 2 remain unchanged.

### CollectionMembership

```ts
type CollectionMembership = {
  readonly collectionId: string
  readonly urlId: string
  readonly categoryId?: string
  readonly notes?: string
  readonly addedAt: number
  readonly updatedAt: number
  readonly sortOrder: number
}
```

The logical identity is the composite `[collectionId, urlId]`. This matches the
rule that one URL can occur once in one collection and places notes, category,
timestamps, and ordering on the relationship. #726 can choose a physical
composite key or a dedicated record key plus a unique compound index, but it
must preserve this logical uniqueness.

### CollectionCategory

```ts
type CollectionCategory = {
  readonly id: string
  readonly collectionId: string
  readonly name: string
  readonly keywords: readonly string[]
  readonly sortOrder: number
  readonly createdAt: number
  readonly updatedAt: number
}
```

Domain `subCategory` and Custom `category` are this one concept. Category names
and ranks are scoped to one collection. A Membership can reference only a
category with the same `collectionId`.

### CollectionGroup

```ts
type CollectionGroup = {
  readonly id: string
  readonly name: string
  readonly sortOrder: number
  readonly createdAt: number
  readonly updatedAt: number
}
```

`CollectionGroup` replaces `ParentCategory`. It does not keep `domains` or
`domainNames`; membership in a group is represented only by
`Collection.groupId`. `sortOrder` preserves current parent-category ordering.

## URL identity policy

### Policy version `exact-url-v1`

The v2 initial identity key validates with the existing `Url` value object and
then preserves the exact source string:

```text
normalizedUrl = validated original url string
```

It does not serialize through `new URL(value).toString()`, lowercase the host,
remove a default port, remove tracking parameters, decode percent escapes, or
otherwise rewrite the source string. This deliberately matches the current
`record.url === url` behavior and prevents a model migration from silently
merging URLs.

The identity corpus is:

| Dimension                                   | Left / right relationship in `exact-url-v1` |
| ------------------------------------------- | ------------------------------------------- |
| exact same source string                    | same identity                               |
| query string differs                        | different identity                          |
| hash differs                                | different identity                          |
| trailing slash differs                      | different identity                          |
| explicit default port differs               | different identity                          |
| hostname case differs                       | different identity                          |
| Unicode domain and punycode spelling differ | different identity                          |
| percent encoding spelling differs           | different identity                          |
| `http` and `https` differ                   | different identity                          |
| `www` presence differs                      | different identity                          |
| tracking parameter presence differs         | different identity                          |
| SPA route differs                           | different identity                          |
| localhost and loopback address differ       | different identity                          |
| extension URL differs                       | different identity                          |
| file URL source string differs              | different identity                          |

Changing any row to same identity is a breaking identity-policy version. It
requires a separate collision preflight and migration; it is not a helper
refactor.

### Uniqueness and collision handling

- A verified v2 snapshot has one `Url` per `normalizedUrl`.
- Source records that produce the same identity key are not silently merged.
  The pre-check emits `URL_IDENTITY_COLLISION` with record identifiers and safe
  counts, never raw URL/title content in diagnostics.
- `DUPLICATE_NORMALIZED_URL` is the post-map invariant violation used by #712.
- #726 must not create or rely on a `normalizedUrl` unique index until #712 and
  #738 prove that the source can satisfy this policy.

### Historical migration title conflict resolution

The retired #728 Chrome Storage migration built title candidates in this stable order:

1. current canonical `urls` records;
2. embedded `savedTabs.urls` records;
3. embedded `customProjects.urls` records.

Within one source class, non-empty title comes first, then greater source
`savedAt`, then stable source record ID (or collection ID plus original array
index). The first non-empty title wins. If all titles are empty, the canonical
title is the empty string. A canonical `urls` title therefore wins when it is
non-empty; an empty canonical title can be filled from a ranked legacy title.

Distinct non-empty candidates emit `URL_TITLE_CONFLICT` and record the selected
candidate metadata. This conflict is reviewable but deterministic; the rule is
not reimplemented as scattered mapper heuristics.

## Ordering policy

Memberships, categories, collections, and groups use finite safe-integer gap
ranks.

```ts
const PERSISTENCE_V2_ORDERING_POLICY = {
  initialGap: 1024,
  ranksMustBeContiguous: false,
  rebalanceScope: 'local-window',
  tieBreak: {
    category: 'id',
    collection: 'id',
    group: 'id',
    membership: ['collectionId', 'urlId'],
  },
} as const
```

- New sequences begin at 1024 and normally advance by 1024.
- Insertions use an available integer between neighboring ranks.
- When a gap is exhausted, a bounded local window is re-ranked; the entire
  following collection is not rewritten.
- Equal ranks are permitted during import/recovery. Collection, Category, and
  Group use stable entity ID as the tie-break; Membership uses its composite
  `[collectionId, urlId]` identity. A normal mutation should converge the local
  window, not depend on array iteration order.
- Ranks must be finite safe integers, but they are not required to be
  contiguous, start at zero, or be globally unique.

Numeric fractional indexing was rejected because repeated midpoint inserts
eventually exhaust JavaScript number precision. A separate lexical-rank store
was deferred because it adds another persisted concept before #726 benchmarks
show a need.

## Timestamp semantics

All values are Unix epoch milliseconds. The field describes the named domain
event, not migration execution time.

| Field                            | Semantics                                        | Mutation that changes it        |
| -------------------------------- | ------------------------------------------------ | ------------------------------- |
| `Url.firstSavedAt`               | First verified time TABBIN saved this URL        | Never after creation            |
| `Url.lastSavedAt`                | Last verified time the URL was saved again       | Re-save event                   |
| `Url.updatedAt`                  | Last canonical title/favicon metadata update     | Canonical metadata change only  |
| `Collection.createdAt`           | Collection creation time                         | Never after creation            |
| `Collection.updatedAt`           | Collection name/definition/group metadata update | Collection metadata change      |
| `CollectionMembership.addedAt`   | Time URL entered this collection                 | Never after membership creation |
| `CollectionMembership.updatedAt` | Notes/category/order metadata update             | Membership metadata change      |
| `CollectionCategory.createdAt`   | Category creation time                           | Never after creation            |
| `CollectionCategory.updatedAt`   | Category name/keywords/order update              | Category metadata change        |
| `CollectionGroup.createdAt`      | Group creation time                              | Never after creation            |
| `CollectionGroup.updatedAt`      | Group name/order update                          | Group metadata change           |

Required relations:

- `Url.firstSavedAt <= Url.lastSavedAt`.
- Every entity has `createdAt <= updatedAt` where both fields exist.
- `Membership.addedAt <= Membership.updatedAt`.
- Collection membership activity does not update `Collection.updatedAt`.

The retired #728 mapper reported `MISSING_TIMESTAMP_PROVENANCE` for absent
legacy timestamps and used the reviewed sentinel `0`. These historical values
remain valid in existing IndexedDB records. Historically migrated AI messages
use their conversation's source `createdAt` because the old message shape had
no timestamp. Message order is not
encoded into that timestamp. Each conversation value carries an ordered
`messageIds` list; writers preserve the message array order there and keep an
existing message record's `createdAt` unchanged when conversation metadata is
updated. Markerless Persistence v2 records from an older build use the
deterministic `(createdAt, id)` order only as a compatibility fallback.

## Historical Chrome Storage to v2 mapping

This table describes the retired conversion and the provenance of existing
IndexedDB records. It does not authorize reading or migrating old Chrome
Storage keys in the current runtime.

| Current concept / field                       | V2 destination                 | Disposition                                             |
| --------------------------------------------- | ------------------------------ | ------------------------------------------------------- |
| `UrlRecord` / `urls`                          | `Url`                          | Canonical URL metadata, one logical record per identity |
| `TabGroup`                                    | domain `Collection`            | `definition.type = 'domain'`                            |
| `TabGroup.domain`                             | `Collection.definition.domain` | Canonical hostname key                                  |
| `CustomProject`                               | custom `Collection`            | `definition.type = 'custom'`                            |
| `CustomProject.projectKeywords`               | custom definition              | Preserved as required arrays after validation           |
| `TabGroup.urlIds`                             | `CollectionMembership`         | One membership per referenced URL                       |
| `CustomProject.urlIds`                        | `CollectionMembership`         | One membership per referenced URL                       |
| `TabGroup.urls`                               | migration input                | Not persisted in v2                                     |
| `CustomProject.urls`                          | migration input                | Not persisted in v2                                     |
| `TabGroup.urlSubCategories`                   | `Membership.categoryId`        | Resolve name to category ID in same collection          |
| `CustomProject.urlMetadata.notes`             | `Membership.notes`             | Membership metadata                                     |
| `CustomProject.urlMetadata.category`          | `Membership.categoryId`        | Resolve within same collection                          |
| `TabGroup.subCategories`                      | `CollectionCategory`           | Unified category entity                                 |
| `CustomProject.categories`                    | `CollectionCategory`           | Unified category entity                                 |
| category keyword arrays                       | `CollectionCategory.keywords`  | Validated string list                                   |
| category order arrays                         | `CollectionCategory.sortOrder` | Gap rank preserving source order                        |
| `customProjectOrder` / collection array order | `Collection.sortOrder`         | Gap rank preserving source order                        |
| `ParentCategory`                              | `CollectionGroup`              | Group metadata only                                     |
| `ParentCategory.domains` / `domainNames`      | migration input                | Removed after resolving `Collection.groupId`            |
| `TabGroup.parentCategoryId`                   | migration input                | Removed after resolving `Collection.groupId`            |
| `DomainParentCategoryMapping`                 | migration input                | Removed after conflict detection                        |

The v2 persisted model does not contain `TabGroup.urls`, `TabGroup.urlIds`,
`CustomProject.urls`, `CustomProject.urlIds`, `TabGroup.urlSubCategories`,
`CustomProject.urlMetadata`, `ParentCategory.domains`,
`ParentCategory.domainNames`, `TabGroup.parentCategoryId`, or
`DomainParentCategoryMapping`.

## Storage Placement Matrix

Current implementation evidence is maintained in the
[current storage writer inventory](./current-storage-writer-inventory.md).
Logical aliases such as saved tabs and custom projects are UI concepts backed
by normalized IndexedDB records.

| Logical data / key                                                | Responsibility                                | Storage                          | Authoritative source                   | Backup V2                          | Change notification                 | Cleanup                                 | Retention                                       |
| ----------------------------------------------------------------- | --------------------------------------------- | -------------------------------- | -------------------------------------- | ---------------------------------- | ----------------------------------- | --------------------------------------- | ----------------------------------------------- |
| Saved URLs                                                        | Canonical saved URL data                      | IndexedDB                        | Url store                              | Yes                                | saved-tabs post-commit protocol     | Unreferenced-URL policy                 | Until user deletion or configured expiry        |
| Saved tabs / custom projects                                      | Collections, membership, categories, ordering | IndexedDB                        | Collection/Membership/Category stores  | Yes                                | saved-tabs post-commit protocol     | Domain transaction                      | Until user deletion                             |
| Parent categories                                                 | Group metadata and collection assignment      | IndexedDB                        | CollectionGroup and Collection.groupId | Yes                                | saved-tabs post-commit protocol     | Domain transaction                      | Until user deletion                             |
| AI conversation history                                           | Conversations, messages, attachments, traces  | IndexedDB                        | AI conversation repository             | Yes, JSON-safe projection          | AI-history post-commit scope        | Conversation deletion                   | Until user deletion, subject to resource limits |
| Saved analytics views                                             | User-defined analytics queries                | IndexedDB                        | Analytics view repository              | Yes                                | analytics post-commit scope         | View deletion                           | Until user deletion                             |
| `userSettings`                                                    | Configuration and prompt presets              | `chrome.storage.local`           | Settings schema                        | Yes, field policy                  | Settings `chrome.storage.onChanged` | None on database startup                | Persistent                                      |
| `activeAiChatConversationId`                                      | Current conversation selection                | `chrome.storage.local`           | Selection control key                  | No; import chooses a valid default | Selection storage event             | Selection repair                        | Until selected conversation disappears          |
| `tab-manager-theme`                                               | UI theme preference                           | `chrome.storage.local`           | ThemeProvider key                      | No                                 | Theme UI state                      | User reset only                         | Persistent                                      |
| `viewMode`                                                        | Retired route preference                      | None; URL route is authoritative | Saved-tabs router                      | No                                 | None                                | Explicit key removal on route bootstrap | Until route bootstrap                           |
| `seenVersion` / `changelogShown`                                  | Release-display controls                      | `chrome.storage.local`           | Background release control             | No                                 | None                                | Overwritten per release                 | Persistent                                      |
| Recovery snapshots                                                | Before-overwrite restore data                 | IndexedDB                        | Recovery snapshot repository           | No; internal artifact              | recovery post-commit scope          | TTL/count cleanup                       | At most 2 snapshots for 7 days                  |
| `tabbin-ai-chat-sidebar-width` / `tabbin-extension-sidebar-width` | Layout preferences                            | Local UI storage                 | Owning component                       | No                                 | None                                | User reset only                         | Per device                                      |

Retired Chrome Storage domain keys, migration flags,
`tabbin:persistenceControlState:v2`, `tabbin:migrationPreflight:v1`, and the
old migration notice-dismissal record are not consulted by domain startup or
operations. Residual values are left in place; there is no migration-dependent
cleanup, fallback, or dual write. Settings and release/UI state remain supported,
and the `storage` permission stays required.

Backup V2 contains the logical IndexedDB model and the supported settings
projection. It does not duplicate old Chrome Storage domain representations.

## Incognito data boundary

TABBIN does not support incognito/private-browsing persistence. Domain data and
every control plane that governs it are normal-context-only. Both generated
manifests declare:

```json
{
  "incognito": "not_allowed"
}
```

### Current behavior inventory and compatibility

Before this decision, the current manifests omit `incognito` and therefore use
the browser default `spanning` mode. There is no `tab.incognito` guard in the
current writer inventory, so private-tab events are processed by the same
background paths as normal tabs when a user grants private access.

- Chrome runs the default spanning extension in one shared process and sends
  incognito events to it. Chrome shares `chrome.storage.local` between regular
  and incognito processes.
- Firefox requires user opt-in for private browsing access. Its default
  `spanning` mode also exposes private and non-private tab/window events to the
  extension, distinguished only by the `incognito` property.
- Both browsers support `not_allowed`; declaring it removes the user opt-in
  surface and prevents private events from entering TABBIN persistence paths.

This is a deliberate compatibility break for users who previously enabled
private access. Existing private URLs were written into shared normal storage
without provenance, so this change neither migrates nor guesses which existing
records came from private browsing. Removing records without provenance would
risk deleting normal user data.

The browser behavior evidence is maintained against the official
[Chrome incognito manifest](https://developer.chrome.com/docs/extensions/reference/manifest/incognito),
[Chrome incognito access](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions),
and
[Firefox incognito manifest](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/incognito)
documentation.

### Normal-only scope

- Database identity, readiness, operation coordination, and recovery are
  normal-context-only.
- Persistence v2 has one normal-context IndexedDB database. It does not create
  a private database or private bootstrap state.
- The normal-context guard rejects unsupported private contexts before any
  persistent domain operation. Web Locks coordinate only supported contexts.
- Backup V2 exports and imports normal-context data only. There is no private
  backup envelope or implicit merge into a normal backup.
- Analytics and AI saved-URL context builders consume normal-context data only.
  They must not infer inclusion merely because a storage engine exposes a
  record.
- Settings, release/UI state, and recovery snapshots use normal-context
  storage boundaries.

Supporting private browsing later requires a dedicated product decision and
separate migration, backup, analytics, AI, cleanup, and browser-compatibility
contracts. Changing only the manifest mode or IndexedDB database name is not a
supported rollout.

## JSON-safe persistence boundary

The shared logical contract is:

```ts
type JsonPrimitive = string | number | boolean | null

type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue }
```

The required flow is:

```text
Runtime object
  -> context Persistence Mapper
Json-safe persisted value
  -> Backup Mapper
Backup V2
```

In particular, `DynamicToolUIPart['input']` and
`DynamicToolUIPart['output']` are runtime SDK types. They must be mapped to
`JsonValue` before persistence; the current `z.unknown()` backup acceptance is
not the v2 contract. A persisted tool trace uses `JsonValue` for input/output
and is validated again at the Backup Mapper boundary.

The runtime guard rejects:

- non-finite numbers and negative zero;
- `undefined`, bigint, functions, and symbols;
- sparse arrays or arrays with non-index properties;
- circular references;
- `Date`, `Blob`, `File`, `Map`, `Set`, typed arrays, `ArrayBuffer`, class
  instances, and other non-plain objects;
- accessor/non-enumerable/symbol-keyed object properties;
- any value whose JSON serialization would silently discard or change current
  semantics.

Date-like values use explicit epoch-millisecond fields. Binary data uses an
explicit metadata/content representation selected by its owning context; an
IndexedDB-cloneable object is not automatically Backup V2-safe.

Violations produce `NON_JSON_SAFE_VALUE` with a safe field path and type class,
not the user content itself.

## Backup V2 resource and round-trip envelope

The public envelope and migration lifecycle follow the
[backup schema versioning](./backup-schema-versioning.md) contract. The backup
`schemaVersion` remains independent of the IndexedDB physical version and the
extension release version.

The executable resource policy is
`src/lib/persistence/backupResourcePolicy.ts`. A supported production state is a
logical snapshot that is healthy under #712, contains only the logical data
included by the Storage Placement Matrix, satisfies every resource limit below,
and serializes to at most 128 MiB of UTF-8 JSON.

For every supported state `x`, #730 must use the same
`validateBackupResourceUsage` policy in both directions so that:

```text
import(export(x)) preserves required logical data, relation, ordering, and
timestamp invariants
```

The Backup V2 mapper collects numeric usage metrics without copying user
content into diagnostics. The supported envelope is:

| Resource                               |                                 Maximum |
| -------------------------------------- | --------------------------------------: |
| Serialized Backup V2 JSON              |                                 128 MiB |
| Logical URLs                           |                            100,000 URLs |
| Collections                            |                                  10,000 |
| Memberships                            |                     500,000 memberships |
| Categories / groups                    |                        100,000 / 10,000 |
| AI conversations / total messages      |                         1,000 / 100,000 |
| Messages per conversation              |                                  10,000 |
| Attachments / attachments per message  |                             100,000 / 5 |
| Decoded attachment bytes               | 2 MiB each; 32 MiB attachment aggregate |
| Saved analytics views                  |                                  10,000 |
| Chart data points                      |         500,000 total; 50,000 per chart |
| Tool traces                            |                                 100,000 |
| Serialized tool-trace input/output     |  1 MiB each; 8 MiB tool-trace aggregate |
| Keywords                               |       1,000 per owner; 1 KiB UTF-8 each |
| URL / name / title UTF-8 bytes         |                  8 KiB / 4 KiB / 64 KiB |
| Notes / AI message content UTF-8 bytes |                           1 MiB / 4 MiB |

Every individual maximum need not be reachable simultaneously. The 128 MiB
serialized-byte ceiling is an additional constraint on combinations of otherwise
valid resources. Attachment count and per-file bytes reuse the production AI
attachment constants; Backup V2 does not maintain a second copy.

### Validation order and typed failures

The required flow is:

```text
export: consistent logical snapshot -> #712 -> usage metrics -> resource policy
        -> serialize -> serialized-byte policy -> file

import: file-size preflight -> parse and schema validation -> usage metrics
        -> resource policy -> normalize -> #712 -> transactional write
```

Limits are not embedded as independent Zod magic numbers. A validation failure
returns a safe resource name, numeric actual value when valid, and numeric limit.
It never returns a URL, name, title, note, keyword, prompt, attachment content,
chart datum, or tool input/output.

- `BACKUP_FILE_TOO_LARGE` identifies serialized-byte overflow.
- `BACKUP_RESOURCE_LIMIT_EXCEEDED` identifies collection or aggregate count
  overflow.
- `BACKUP_NESTED_PAYLOAD_TOO_LARGE` identifies per-owner and nested byte/count
  overflow.
- `INVALID_BACKUP` identifies a non-finite, negative, fractional, or otherwise
  unsafe usage metric and remains distinct from a valid over-limit backup.

The current importer accepts Backup V2 only and validates all supported
resource classes. Pre-IndexedDB backups are rejected before persistence is
mutated. AI data is not silently excluded to make a limit pass.

### Benchmark and recovery capacity

A local Node v24.18 synthetic benchmark used 100,000 representative URLs,
10,000 collections, and 500,000 memberships. Compact JSON was 90.49 MiB;
construction took 46.9 ms, stringify 103.0 ms, and parse 222.8 ms. RSS grew from
31.9 MiB to 596.4 MiB after stringify and 718.3 MiB after parse. The production
download path uses compact JSON so the measured representation and enforced Blob
size match; whitespace-formatted JSON is not a supported export representation.
This evidence rejects the old 10 MiB assumption and also rejects an unmeasured
256 MiB cap. The remaining #730 schema, Zod, normalize, FileReader, and browser
peak-memory benchmarks must run against its actual compact Backup V2 mapper
before rollout.

#740 may retain at most two recovery snapshots for seven days. Capacity
preflight uses actual serialized snapshot bytes and #735 reserve/overhead rather
than assuming every snapshot reaches 128 MiB. The hard policy still bounds two
retained payloads at 256 MiB before IndexedDB overhead. Recovery snapshot failure
blocks overwrite import; no snapshot is silently skipped.

## Historical migration recoverability

The following source-field analysis documents previously migrated data. The
Chrome Storage reader/mapper and its preflight are retired by Issue #861; these
entries do not describe a supported migration path.

| V2 field                            | Current source                                     | Recoverability                                                                  |
| ----------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------- |
| `Url.id`                            | `urls.id` or deterministic migration ID plan       | Recoverable when current ID is valid; ID generation belongs to #728             |
| `Url.url`                           | canonical/embedded URL string                      | Recoverable after URL validation                                                |
| `Url.normalizedUrl`                 | `exact-url-v1` identity key                        | Derivable without rewriting source                                              |
| `Url.title`                         | ranked title candidates                            | Recoverable by the deterministic conflict rule                                  |
| `Url.favIconUrl`                    | current URL/embedded record                        | Recoverable when valid; otherwise omitted with issue                            |
| `Url.firstSavedAt`                  | minimum semantically valid URL save timestamp      | Partially recoverable; missing provenance is reported                           |
| `Url.lastSavedAt`                   | maximum semantically valid URL save timestamp      | Partially recoverable; missing provenance is reported                           |
| `Url.updatedAt`                     | canonical metadata update timestamp                | Not present in the current model; no guessed migration timestamp                |
| Collection domain/custom definition | TabGroup/CustomProject                             | Recoverable after schema validation                                             |
| `Collection.groupId`                | parent ID plus parent/mapping reconciliation       | Recoverable only when duplicated sources agree; conflict requires review        |
| `Collection.sortOrder`              | source arrays and `customProjectOrder`             | Recoverable as gap ranks; invalid/missing references are typed issues           |
| Collection timestamps               | CustomProject timestamps or source metadata        | Custom is usually recoverable; domain collection timestamps may lack provenance |
| Membership relation                 | `urlIds`, embedded URLs, and collection identity   | Recoverable after dangling/duplicate checks                                     |
| Membership notes/category           | `urlMetadata`, `urlSubCategories`, embedded fields | Recoverable when category resolution is unambiguous                             |
| Membership timestamps               | per-URL `savedAt` where semantics match            | Partially recoverable; absence is not replaced with migration time              |
| Category name/keywords/order        | category arrays, keyword arrays, order arrays      | Recoverable after type and duplicate validation                                 |
| Group timestamps                    | no reliable current event timestamps               | Not recoverable without an explicit #728 fallback                               |

`MISSING_TIMESTAMP_PROVENANCE` is an input to #712/#738, not permission to
manufacture timestamps. #728 must document any fallback value and its distinct
provenance before writing required target records.

## Invariants for #712

The machine-readable code list is exported as
`PERSISTENCE_V2_INVARIANT_CODES`. The checker must at least enforce:

- `DUPLICATE_URL_ID`: URL IDs are unique.
- `DUPLICATE_NORMALIZED_URL`: verified identity keys are unique.
- `URL_IDENTITY_COLLISION`: source records collide under the selected policy;
  migration must not silently merge them.
- `URL_TITLE_CONFLICT`: multiple non-empty canonical title candidates exist.
- `COLLECTION_MISSING`: Membership references no Collection.
- `URL_MISSING`: Membership references no Url.
- `CATEGORY_MISSING`: Membership category does not exist.
- `CATEGORY_COLLECTION_MISMATCH`: Membership and category collections differ.
- `GROUP_MISSING`: Collection references no CollectionGroup.
- `DUPLICATE_MEMBERSHIP`: `[collectionId, urlId]` repeats.
- `ORPHAN_URL`: Url has no Membership, subject to the explicit orphan policy.
- `ORPHAN_CATEGORY`: Category belongs to no valid Collection.
- `INVALID_MEMBERSHIP_ORDER`, `INVALID_CATEGORY_ORDER`,
  `INVALID_COLLECTION_ORDER`, `INVALID_GROUP_ORDER`: rank is not a finite safe
  integer or stable tie-break cannot be applied. Non-contiguity alone is valid.
- `DUPLICATE_DOMAIN_COLLECTION`: canonical domain occurs in multiple domain
  Collections.
- `INVALID_TIMESTAMP_RELATION`: a timestamp relation above is false.
- `MISSING_TIMESTAMP_PROVENANCE`: required domain-event time is unavailable.
- `NON_JSON_SAFE_VALUE`: persisted/backup value crosses the JSON-safe boundary.
- `INVALID_ACTIVE_CHAT_REFERENCE`: selection points to no conversation; because
  selection is not backed up, import resolves it to a valid default.

The checker reports and classifies issues; repair remains a separate audit ->
plan -> backup -> repair -> re-audit flow.

### Pure checker boundary

`checkPersistenceIntegrity(snapshot)` accepts only a logical
`PersistenceV2Snapshot`. It does not import Chrome or IndexedDB APIs, normalize
input, write storage, or repair the snapshot. It returns a deterministic
`StorageIntegrityReport`; `isHealthy` is true only when the typed `issues` list
is empty.

Operational reads and Backup V2 import admission use the issue severity rather
than `isHealthy` as their blocking boundary. An `error` finding rejects the
snapshot. A warning-only snapshot remains readable and preserves its records
for explicit review; in particular, an `ORPHAN_URL` warning must not make a
record accepted by an older migration unreadable after an update.

Every code in `PERSISTENCE_V2_INVARIANT_CODES` has an exhaustive severity and
repairability entry in `PERSISTENCE_V2_INVARIANT_POLICY`. The v2 checker emits
only findings supported by the logical target snapshot. Source-only findings,
including `URL_IDENTITY_COLLISION`, `URL_TITLE_CONFLICT`,
`MISSING_TIMESTAMP_PROVENANCE`, and `INVALID_ACTIVE_CHAT_REFERENCE`, are kept in
the shared typed contract for migration/import adapters and are not inferred
without source evidence.

Diagnostics include stable entity identifiers, field paths, occurrence counts,
and type classes. They do not copy URL, title, domain, note, keyword, prompt, or
other user content into the report.

### Repair-plan boundary

`createStorageRepairPlan(report)` is also pure. It converts only
`automatic-safe` issues into typed dry-run operations and leaves every
ambiguous or non-repairable issue in `unresolvedIssues`. Duplicate memberships
produce `REMOVE_DUPLICATE_MEMBERSHIP` only when all non-key metadata is
equivalent; conflicting category, note, ordering, or timestamp metadata requires
review. An invalid active-chat selection can produce the non-destructive
`RESET_ACTIVE_CHAT_REFERENCE` operation.

`ORPHAN_URL` never produces an automatic deletion operation. The plan's
`destructive` flag is derived from its operations, and executing those
operations remains a caller-owned step after review and backup. Callers must
re-run `checkPersistenceIntegrity` after any repair. An `error` finding blocks
normal domain access; it does not authorize deleting data.

## Query and projection boundary

Normalized stores are write models. UI, analytics, and AI features do not join
object stores or persistence arrays directly. Query adapters return projections
such as:

```ts
findRecentlySavedUrls()
findUrlsByCollection(collectionId)
findCollectionsByGroup(groupId)
findMembershipsByUrl(urlId)
findExpiringUrls()
```

Required projections include Collection + Membership + Url + optional Category
for collection pages, group-with-collections for Domain mode, URL-with-
collections for reverse lookup, and logical analytics/AI saved-URL records.
#726 must batch/index these reads and avoid per-membership URL fetches.

Recently saved, this week, frequent URLs, expiring soon, and duplicates are
derived views. They are queries/read models, not persisted Collections, unless a
later product requirement explicitly turns one into user-owned data.

## IndexedDB readiness and recovery

`PersistenceBootstrap.ready()` opens the normal-context IndexedDB database and
runs its supported schema upgrade. It reads neither Chrome Storage domain data
nor Chrome migration/control records. Database absence initializes an empty
database; existing stores and records are preserved.

Readiness does not scan the complete domain snapshot. Snapshot readers retain
record decoding and blocking integrity checks, while recovery snapshots stay
accessible even when current domain records are damaged. Database failures are
reported through the typed persistence recovery path; retry closes and reopens
the connection. Recovery never falls back to legacy Chrome Storage.

Normal reads and writes retain the stable cross-context Web Lock in shared
mode. The existing lock name is preserved so overlapping extension contexts
continue to coordinate. Missing or rejected Web Locks fail closed as
`PERSISTENCE_COORDINATION_UNAVAILABLE`; there is no lockless production
fallback. A module Promise is only a same-context single-flight optimization.

Settings use dedicated Chrome Storage ports and remain available independently
of domain database readiness. The trusted-context access restriction and
no-content-script manifest invariant remain security-sensitive.

The legacy router, migration lifecycle, raw reader/mapper, source preflight,
migration emergency backup, and migration-dependent cleanup are retired.
Current Backup V2 overwrite import keeps its before-overwrite recovery snapshot,
transactional replacement, integrity validation, and bounded recovery storage.
Schema migration inside IndexedDB and explicit integrity repair remain supported.

## Current ownership and verification

- Domain writes use use-case-sized, multi-store IndexedDB transactions and
  revision checks; repository transactions must not split one aggregate mutation.
- Snapshot/query adapters own record decoding, logical projection, and integrity
  admission. Presentation, analytics, and AI consume these projections.
- Backup V2 schema, resource metrics, JSON safety, and overwrite recovery are
  shared contracts. Every data class included in Backup V2 participates in
  export/import invariants.
- Post-commit notifications carry safe metadata only. Consumers invalidate and
  re-query persistence state; missed, duplicate, or out-of-order events and
  restarts converge by reading current records.
- The writer inventory covers current Chrome settings/UI mutations and
  IndexedDB domain/replacement/recovery boundaries. New writers require matching
  inventory entries and verifier coverage.
- New-install and already-migrated restart/update smoke tests exercise Chrome
  and Firefox. Dormant-user Chrome Storage migration is outside the product
  contract established by Issue #861.
