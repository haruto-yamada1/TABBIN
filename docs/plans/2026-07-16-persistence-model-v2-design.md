# Persistence Model v2 Design

## Contract

Issue #725 is the Phase 0 model contract for the Persistence Model v2 epic
(#724). This change must settle the logical model before #726 fixes an
IndexedDB schema. It does not migrate data, create object stores, or switch the
runtime source of truth.

## Current constraints

- Current URL lookup uses the preserved source string and exact equality.
- `TabGroup`, `CustomProject`, `UrlRecord`, and `ParentCategory` duplicate
  relations across `urls`, `urlIds`, metadata maps, and parent mappings.
- Current backup data includes `unknown` AI tool input/output and therefore
  does not prove a JSON-safe persistence boundary.
- `customProjectOrder` and array position persist user ordering, while the v2
  model needs an ordering policy that does not require contiguous integers.
- #712 and #726 consume this model, so invariant and identity decisions must be
  machine-readable without coupling the domain to IndexedDB.

## Decisions

### URL identity

Adopt `exact-url-v1`: a URL must pass the existing WHATWG validation, but its
identity key preserves the original string. Query, hash, protocol, hostname
case, default port, punycode spelling, percent encoding, trailing slash,
tracking parameters, SPA routes, `www`, extension URLs, and file URLs remain
different identities unless the complete stored strings match.

This preserves current behavior and prevents migration-time silent merging.
WHATWG serialization or tracking-parameter removal would be a breaking,
versioned identity migration with its own collision preflight.

### Membership identity

Use the composite logical identity `[collectionId, urlId]`. A URL can belong to
a collection once, and membership metadata (`categoryId`, `notes`, timestamps,
and order) belongs to that relation. #726 may choose the physical IndexedDB key
path, but it must preserve this logical uniqueness.

### Ordering

Use finite safe-integer gap ranks with an initial step of 1024. Ordering is by
`sortOrder`, then stable logical identity: entity ID for Collection, Category,
and Group, and `[collectionId, urlId]` for Membership. Ranks are not required to
be contiguous or globally unique. Insertions consume a gap; an exhausted gap
triggers a bounded local rebalance rather than rewriting every following
record.

Fractional JavaScript numbers were rejected because repeated midpoint inserts
eventually exhaust precision. A separate lexical-rank structure was rejected
for v2 because it adds a second persistence concept before measured need.

### Entity ordering completeness

`Collection` and `CollectionGroup` also carry `sortOrder`. The current model
persists project and parent-category order, so omitting these fields would lose
user-visible order even though the initial Issue sketch only listed membership
and category ranks.

### JSON-safe boundary

Persisted and Backup V2 values use a recursive `JsonValue` contract. The
runtime guard rejects non-finite numbers, `undefined`, bigint, functions,
symbols, sparse arrays, non-plain objects, and circular references. Runtime AI
SDK values remain runtime types and must pass through a persistence mapper;
`DynamicToolUIPart['input']` and `['output']` are not persistence types.

### Storage placement

- Normalized domain data and large user content belong in IndexedDB.
- Small settings and trusted migration/release control state remain in
  `chrome.storage.local`.
- Ephemeral layout/session state remains local UI or session storage and is
  outside Backup V2.
- No data has dual authority. Legacy keys are migration sources only after
  their v2 cutover.
- The full matrix and retention decisions live in
  `docs/architecture/persistence-model-v2.md`.

### Timestamp migration

V2 timestamps describe domain events, not migration execution time. A mapper
may use only source timestamps with matching semantics. Missing provenance is a
typed migration issue; this Issue does not invent `Date.now()` fallbacks.

## Artifacts

- An authoritative architecture document with entity responsibilities,
  mappings, invariants, timestamp semantics, identity corpus, placement matrix,
  recoverability, and projection boundaries.
- Domain-only TypeScript contracts for v2 entities and invariant codes.
- An executable exact-identity corpus and JSON-safe runtime guard.
- A repository policy test that prevents required model sections from
  disappearing.

## Rollback

The new contracts are not wired to the current chrome-storage runtime or an
IndexedDB implementation. Reverting the added files restores the previous
runtime without data migration or compatibility work.
