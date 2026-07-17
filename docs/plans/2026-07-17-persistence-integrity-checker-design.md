# Persistence Integrity Checker Design

## Context

Issue #712 requires a storage-engine-independent audit boundary for the
Persistence Model v2 contract established by Issue #725. The same logical
snapshot checker must be usable before or after IndexedDB writes without
performing storage reads, writes, normalization, or repair itself.

## Considered approaches

### 1. Add checking functions to `PersistenceModelV2.ts`

This keeps the types and invariants together, but turns the entity contract
file into a growing service module and couples future repair planning to model
declarations.

### 2. Add separate domain services for audit and repair planning

This keeps `PersistenceModelV2.ts` as the entity contract. A pure checker owns
typed findings and invariant policy, while a second pure function converts
only safely repairable findings into a dry-run plan. This is the selected
approach because it enforces the Issue #712 audit/repair boundary structurally.

### 3. Create a new cross-cutting persistence context

This could eventually fit the IndexedDB transaction and repository work in
Issue #726, but it would decide ownership before those contracts exist and
would move the Issue #725 model away from its current saved-tabs boundary.

## Selected design

`checkPersistenceIntegrity(snapshot)` lives in the saved-tabs domain service
layer. It accepts `PersistenceV2Snapshot` and returns a deterministic
`StorageIntegrityReport`. Findings are a discriminated union keyed by the
existing `PersistenceV2InvariantCode`; every code has a typed severity and
repairability policy.

The v2 checker detects duplicate identifiers and logical identities, dangling
references, category/collection mismatches, invalid group references, orphaned
entities, unsafe ordering ranks, duplicate domain collections, timestamp
relations, and non-JSON-safe values. Source-only findings such as identity
collisions, title conflicts, missing source timestamp provenance, and invalid
active-chat selection remain valid typed codes for migration adapters, but the
v2 snapshot checker does not invent them without source evidence.

Diagnostics contain stable entity identifiers, field paths, counts, and type
classes only. They do not copy raw URLs, titles, domains, notes, keywords, or
other user content into reports.

`createStorageRepairPlan(report)` is a separate pure function. It emits typed
operations only for `automatic-safe` findings and returns all other findings as
unresolved. Duplicate memberships produce an idempotent
`REMOVE_DUPLICATE_MEMBERSHIP` dry-run operation only when their non-key metadata
is equivalent. Metadata conflicts require review. Orphan URLs and ambiguous
relations never become deletion operations automatically. Operations and the
overall plan explicitly identify destructive behavior; neither function
executes a repair.

## Data flow

```text
logical PersistenceV2Snapshot
  -> checkPersistenceIntegrity
  -> typed StorageIntegrityReport
  -> createStorageRepairPlan
  -> dry-run StorageRepairPlan
  -> caller-controlled review / backup / execution / re-audit
```

## Verification

Reusable corrupted fixtures cover each Issue #712 relation and duplicate
class. Tests first prove the absent checker and planner APIs fail, then verify a
healthy snapshot, deterministic typed findings, safe diagnostics, repair-plan
separation, and the no-orphan-deletion rule. Repository-wide coverage, quality,
architecture, and release gates remain required before publication.
