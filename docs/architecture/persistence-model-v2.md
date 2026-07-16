# Persistence Model v2

Status: reviewed target contract for Issue #725  
Parent: Issue #724

This document is authoritative for the logical Persistence Model v2 consumed
by #712, #726, #728, #730, and #738. The TypeScript proposal is in
`src/contexts/saved-tabs/domain/entities/PersistenceModelV2.ts`; executable URL
identity examples are in `urlIdentityCorpus.ts`.

This contract does not create IndexedDB stores, migrate current data, or switch
the runtime source of truth. Those changes remain separate Issues and PRs.

## Aggregate boundary

The normalized saved-tabs aggregate consists of `Url`, `Collection`,
`CollectionMembership`, `CollectionCategory`, and `CollectionGroup`.

- The aggregate contract lives in `contexts/saved-tabs/domain`; it does not
  depend on Chrome Storage or IndexedDB.
- Domain and Custom are `Collection.definition` variants, not separate storage
  aggregates.
- Settings, AI conversations, analytics views, release controls, migration
  controls, and recovery snapshots retain their own context ownership. The
  Storage Placement Matrix decides their engine and authority without making
  them saved-tabs domain entities.
- Shared JSON serialization rules live in `src/lib/persistence/json-value.ts`.
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

### Deterministic title conflict resolution

Migration builds title candidates in this stable order:

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

A missing legacy timestamp is not replaced with migration time. It produces
`MISSING_TIMESTAMP_PROVENANCE`; the actual #728 mapper must apply an explicitly
reviewed fallback policy before creating a valid required field.

## Current to v2 mapping

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

The matrix records logical data, not only currently centralized constants. #711
remains authoritative for writer/context inventory and may discover additional
entrypoints; new rows must be classified before #726 is finalized.

| Current data / key                                                | Logical responsibility                        | Target storage                               | Authoritative source                         | Backup V2                                    | Change notification                               | Legacy cleanup                               | Retention                                           |
| ----------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------- | -------------------------------------------- | -------------------------------------------- | ------------------------------------------------- | -------------------------------------------- | --------------------------------------------------- |
| `urls`                                                            | canonical saved URL data                      | IndexedDB                                    | v2 `Url` store                               | Yes, logical URLs                            | #739 saved-tabs change protocol                   | Yes after verified cutover                   | Persistent while referenced; orphan policy by #712  |
| `savedTabs`                                                       | legacy domain collections and relations       | IndexedDB                                    | v2 Collection/Membership/Category            | Yes, logical mapping                         | #739 saved-tabs change protocol                   | Yes after verified cutover                   | Migration source only after cutover                 |
| `customProjects`                                                  | legacy custom collections and relations       | IndexedDB                                    | v2 Collection/Membership/Category            | Yes, logical mapping                         | #739 saved-tabs change protocol                   | Yes after verified cutover                   | Migration source only after cutover                 |
| `parentCategories`                                                | legacy group metadata and duplicated relation | IndexedDB                                    | v2 CollectionGroup plus `Collection.groupId` | Yes, logical groups                          | #739 saved-tabs change protocol                   | Yes after verified cutover                   | Migration source only after cutover                 |
| `customProjectOrder`                                              | custom collection ordering                    | IndexedDB                                    | `Collection.sortOrder`                       | Yes, logical order                           | #739 saved-tabs change protocol                   | Yes after verified cutover                   | Migration source only after cutover                 |
| `domainCategoryMappings`                                          | legacy duplicated parent relation             | IndexedDB                                    | `Collection.groupId`                         | No raw key; logical relation is backed up    | #739 saved-tabs change protocol                   | Yes after verified cutover                   | Migration source only                               |
| `domainCategorySettings`                                          | legacy domain category configuration          | IndexedDB                                    | CollectionCategory/keywords                  | No raw key; logical categories are backed up | #739 saved-tabs change protocol                   | Yes after verified cutover                   | Migration source only                               |
| `urlsMigrationCompleted` / `domainHostnameMigrationCompleted`     | legacy migration flags                        | `chrome.storage.local` until legacy cleanup  | legacy bootstrap code                        | No                                           | Internal bootstrap event                          | Remove with owning legacy migrator           | Until corresponding legacy path is removed          |
| `userSettings`                                                    | small user configuration and prompt presets   | `chrome.storage.local`                       | `userSettings` schema                        | Yes, field policy                            | Existing settings `chrome.storage.onChanged` path | Keep                                         | Persistent                                          |
| `aiChatConversations`                                             | large user-authored conversation content      | IndexedDB                                    | AI conversation repository                   | Yes through JSON-safe projection             | #739 AI-history scope                             | Remove chrome key after verified migration   | Persistent subject to user deletion and #719 limits |
| `activeAiChatConversationId`                                      | per-device current selection                  | `chrome.storage.local`                       | selection control key                        | No; import selects a valid default           | #739 selection scope or local settings event      | Keep                                         | Persistent until referenced conversation disappears |
| `savedAnalyticsViews`                                             | user-defined analytics projections            | IndexedDB                                    | analytics view repository                    | Yes                                          | #739 analytics scope                              | Remove chrome key after verified migration   | Persistent until user deletion                      |
| `tab-manager-theme`                                               | legacy UI preference                          | `chrome.storage.local` under `userSettings`  | `userSettings` theme field                   | Yes through settings                         | Settings change event                             | Remove standalone legacy key after migration | Persistent                                          |
| `viewMode`                                                        | legacy saved-tabs route preference            | None; URL route is authoritative             | saved-tabs router                            | No                                           | No                                                | Remove on route bootstrap                    | Until the first v2 route bootstrap                  |
| `seenVersion` / `changelogShown`                                  | release display control                       | `chrome.storage.local`                       | background release control                   | No                                           | No cross-context domain event                     | Keep                                         | Persistent, overwritten per release policy          |
| migration control state                                           | trusted migration barrier and phase           | `chrome.storage.local`                       | one control-plane record defined by #727     | No                                           | Internal barrier event                            | Keep by compatibility policy                 | Through cutover and forward-fix window              |
| notice dismissals                                                 | versioned migration-notice UX control         | `chrome.storage.local` dedicated control key | notice control record                        | No                                           | Settings/control event                            | Keep; expire by notice version               | Until the represented notice expires                |
| recovery snapshots                                                | overwrite-import recovery data                | IndexedDB                                    | recovery repository from #740                | No (internal backup artifact)                | #739 recovery lifecycle event                     | TTL cleanup by #740                          | Bounded TTL and count from #740                     |
| `tabbin-ai-chat-sidebar-width` / `tabbin-extension-sidebar-width` | local layout preference                       | local UI storage                             | owning UI component                          | No                                           | No                                                | Keep outside migration                       | Persistent per device; safe to reset                |

No raw current key is a second authority after its logical cutover. Backup V2
contains the logical model, not both legacy and v2 representations.

## JSON-safe persistence boundary

The shared logical contract is:

```ts
type JsonPrimitive = string | number | boolean | null

type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue }
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

## Migration recoverability

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

## Handoff and review gates

- #711 owns complete writer/context/implicit-writer inventory. A newly found
  logical data class must be added to the matrix before schema finalization.
- #712 owns the pure checker and issue severity/repairability.
- #726 owns physical object stores, indexes, key paths, connection lifecycle,
  transactions, and benchmarks. It must preserve this logical model.
- #719/#730 own supported Backup V2 limits and round-trip behavior. Every matrix
  row marked Backup V2 = Yes participates in `import(export(x))` invariants.
- #738 must run identity, timestamp, reference, capacity, and JSON-safety
  preflight without mutating the source.

Model review is complete for #725 when this document, the TypeScript proposal,
the executable corpus, the JSON-safe guard, and the policy tests agree. This is
not authorization to release #726/#728/#729 as one combined cutover.
