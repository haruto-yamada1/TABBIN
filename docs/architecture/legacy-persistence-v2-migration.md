# Legacy Chrome Storage to Persistence v2 migration

Status: implemented migration capability for Issue #728
Parent: Issue #724

This document is authoritative for converting the legacy
`chrome.storage.local` snapshot into the Persistence v2 stores. Runtime
source-of-truth selection and automatic cutover remain owned by Issue #729.
Composing the lifecycle does not start migration: only an explicit
`PersistenceBootstrap.migrate(migrationId)` request may enter it.

## Source boundary

`ChromeRawLegacyStorageReader` reads all migration keys in one call while the
cross-context migration barrier is held exclusively. It distinguishes a
missing property from a present `undefined` value and never uses a forgiving
production getter.

`LegacyChromeStorageDto` is the dedicated legacy schema/DTO boundary. The mapper
does not reuse current production types and does not mutate the captured raw
snapshot. Top-level missing array keys become an aggregate warning and an
empty DTO array. A present non-array value is an error. Invalid inner records
are also errors rather than silently disappearing from an approved migration.

The emergency raw backup path remains
`MigrationPreflightService.createCurrentDataBackup()`. The production recovery
controller calls that exact raw reader path rather than the forgiving public
export path. Migration never repairs or deletes legacy source records.

If #712 produces an automatic-safe repair plan with a production executor, the
required sequence is backup, explicit repair, preflight rerun, and migration
against the new fingerprint. The current legacy mapper does not expose a
production-reachable automatic-safe source repair: ambiguous or destructive
legacy conflicts remain blocking instead of being silently rewritten.

## Deterministic mapping rules

`mapLegacyStorageToPersistenceV2()` is the one pure rule set shared by
preflight and the actual migration.

- URL identity is `exact-url-v1`; the source string is not reserialized or
  normalized.
- Canonical and nested URL records are both examined. Duplicate IDs, duplicate
  exact identities, mismatched references, and conflicting parent/category
  sources are typed blocking issues. No record wins through input order and no
  collision is silently merged.
- Domain and custom-project records map to `Collection`; nested `urls` and
  `urlIds` map to `Url` and `CollectionMembership`. Notes, category, group, and
  ordering fields are preserved in their v2 destinations.
- Domain category order comes from `subCategoryOrder`, or from
  `subCategoryOrderWithUncategorized` after removing its
  `__uncategorized` sentinel. Duplicate, incomplete, unknown, or conflicting
  order metadata blocks migration. Custom category order and
  `customProjectOrder` follow the same fail-closed rule.
- A missing historical saved-tabs timestamp uses the explicit sentinel `0`
  and emits `MISSING_TIMESTAMP_PROVENANCE`. Migration time is never used as
  historical time.
- AI conversations keep their source `createdAt` and `updatedAt`. Because the
  legacy message shape has no timestamp, each message uses its conversation's
  source `createdAt`. Analytics views require their source timestamps.
- URL title conflicts are reported, not resolved by input order. The current
  preflight approval policy blocks every issue except a missing top-level key,
  so a conflicting title cannot reach target writes.

The mapper runs `PersistenceIntegrityChecker` before any IndexedDB operation.
Only an approved, error-free target may be written.

## Target transaction and restart protocol

Migration uses `IndexedDbPersistenceMigrationTarget`, a private adapter injected
only into the bootstrap lifecycle. It deliberately does not use the normal
gated IndexedDB unit of work or snapshot reader: those adapters acquire the
shared route gate and would deadlock or reject while bootstrap already holds
the exclusive migration barrier.

The native-browser scale profile has not authorized one unbounded transaction.
The application therefore uses batches of at most 1,000 records. Each batch is
a strict-durability transaction that queues only IndexedDB requests; no
external `await` occurs after a transaction opens.

`prepare(migrationId)` first reads private target metadata in the same strict
transaction. A different owning ID fails before any clear; the same ID then
atomically:

1. clears every migratable target store;
2. preserves `recoverySnapshots`;
3. resets the internal revision; and
4. writes private `migrationTarget` metadata in `copying` state.

Each committed batch increments the internal revision. `markWritten()` moves
the metadata to `written`; successful read-back moves it to `verified`.
Metadata always contains the owning `migrationId`, and mismatched IDs or phases
fail closed.

A restart or retry calls `prepare()` again. This discards a partial target and
deterministically replays the immutable legacy snapshot. A partial or merely
written target is never a runtime source of truth.

## Fingerprints and verification

Preflight captures source fingerprint A. Bootstrap and the migration service
compare the current source to the approved preflight before target writes.
Verification then re-reads the raw source and computes fingerprint B. If B no
longer matches the approved fingerprint, verification stops before read-back
publication.

Read-back occurs in one readonly transaction across all v2 source stores.
`PersistenceIntegrityChecker` runs again on the materialized saved-tabs
aggregate. Semantic verification compares the full URL, collection,
membership, category, group, conversation, message, and analytics records
while ignoring storage order and the internal revision. Counts alone cannot
approve a target.

Failures retain the legacy source and produce typed codes. The recovery
diagnostic records `migrationId`, lifecycle stage, typed error code, issue
codes, serialized source bytes, and aggregate source entity counts. It never
contains URL, title, notes, prompt, attachment, or analytics-query content.
The latest diagnostic and successful migration report are exposed through the
production runtime's `migrationRecovery` port rather than hidden behind the
concrete service type.

The recovery notice provides three distinct actions:

- **Back up current data** downloads a versioned
  `tabbin-legacy-emergency-backup` JSON envelope. The envelope deliberately
  contains raw private user data and carries an explicit privacy warning.
  Its `tabbin-tagged-json-v1` value encoding tags every value, so a present
  `undefined` and user objects that resemble encoding tags round-trip without
  ambiguity.
- **Run checks and retry** executes #738 preflight again and proceeds to
  bootstrap retry only if the new status is healthy.
- **Retry** repeats bootstrap with the current approval and target state.

The notice can copy the raw-free diagnostic, but it never copies the emergency
backup payload. The migration report likewise contains only aggregate entity
and warning counts.

## Cutover boundary

Issue #728 supplies the production lifecycle and resumable target protocol, but
does not make IndexedDB authoritative. Issue #729 must switch runtime
repositories and source selection before enabling automatic migration. Until
then, `ready()` treats `legacy` as stable and no background cutover is started.
An explicit `migrate()` may copy and verify the target, but the production
bootstrap policy stops at `cutover-pending`; both the initial call and a restart
leave the final `complete-cutover` transition to #729.
