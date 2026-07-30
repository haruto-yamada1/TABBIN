# Backup Schema Versioning

- Status: public migration-kernel contract for Issue #713
- Parent: Issue #724
- Production Backup V2 owner: Issue #730

## Version domains

TABBIN keeps three version domains independent:

| Version           | Meaning                                       | Owner                         |
| ----------------- | --------------------------------------------- | ----------------------------- |
| `appVersion`      | Extension release provenance                  | Manifest / release process    |
| `schemaVersion`   | Public backup import and export data contract | Backup schema registry        |
| `databaseVersion` | IndexedDB object stores and indexes           | IndexedDB upgrade transaction |

`appVersion` is diagnostic metadata. It never selects a backup parser or
migration, and semver comparison is not a compatibility rule.

`schemaVersion` selects a public backup schema and its ordered migration path.
It is independent of how the logical data is stored.

`databaseVersion` changes when the physical IndexedDB schema changes. It does
not appear in `BackupEnvelope`, and an object-store dump is not a backup format.

## Backup envelope

Versioned backup input has this generic envelope:

```ts
type BackupEnvelope<TData> = {
  readonly schemaVersion: number
  readonly appVersion: string
  readonly exportedAt: string
  readonly data: TData
}
```

The production current contract is `BackupEnvelopeV2`:

```ts
type BackupEnvelopeV2 = {
  readonly schemaVersion: 2
  readonly appVersion: string
  readonly exportedAt: string
  readonly data: {
    readonly savedTabs: {
      readonly urls: readonly PersistenceV2Url[]
      readonly collections: readonly PersistenceV2Collection[]
      readonly memberships: readonly PersistenceV2CollectionMembership[]
      readonly categories: readonly PersistenceV2CollectionCategory[]
      readonly groups: readonly PersistenceV2CollectionGroup[]
    }
    readonly conversations: readonly PersistenceJsonRecord[]
    readonly messages: readonly PersistenceMessageRecord[]
    readonly analyticsViews: readonly PersistenceJsonRecord[]
    readonly userSettings: UserSettings
  }
}
```

Backup V2 is a logical, JSON-safe projection selected by the Storage Placement
Matrix. It is never an IndexedDB database, object-store, index, cache, migration
metadata, recovery snapshot, revision, transaction log, or other internal
control state.

The concrete runtime contract and canonical mapper live in
`src/features/options/lib/import-export/v2/BackupV2Schema.ts` and
`BackupMapper.ts`. The current Options export entry point is composed in
`src/app/composition/optionsBackupV2Export.ts`; the old schema-less
`exportSettings` remains a compatibility boundary and is not called by the
production Options export button.

## Consistent and deterministic export

The IndexedDB-backed portion of a backup is read by
`IndexedDbPersistenceSnapshotReader` in one readonly transaction spanning the
saved-tab, conversation, message, and analytics stores. The mapper then removes
the internal revision and canonicalizes logical records, entity arrays, and
JSON object keys. Equivalent logical snapshots therefore produce identical
`data`; only the caller-provided `exportedAt` changes with the clock.

User settings remain owned by `chrome.storage.local` and are read after the
IndexedDB snapshot. Browser storage engines cannot participate in one atomic
transaction, so Backup V2 does not claim cross-engine atomicity for settings.
The schema still validates the combined public envelope strictly and rejects
non-JSON-safe values without silently repairing them.

Export validation order is:

```text
one IndexedDB logical snapshot
  -> #712 saved-tabs integrity check
  -> strict public mapping and canonical ordering
  -> logical resource limits
  -> JSON serialization
  -> serialized-byte limit
```

The shared resource limits live in
`src/lib/persistence/backupResourcePolicy.ts`. A healthy backup is not rejected
by the former fixed 10 MiB file limit; both export and import use the shared
128 MiB serialized limit plus entity, nested-array, and UTF-8 byte limits.

## Format detection boundary

Unknown JSON is classified before version-specific parsing:

```text
unknown JSON
  -> object with positive integer schemaVersion: versioned
  -> object without schemaVersion: legacy candidate
  -> malformed object or invalid schemaVersion: INVALID_SCHEMA
```

Legacy classification is routing information only. The versioned pipeline does
not parse, migrate, or accept pre-IndexedDB data.

`BackupV2Inspector.ts` owns strict current, future, and legacy inspection.
Current V2 is fully validated before it is accepted, a future positive integer
version preserves `UNSUPPORTED_FUTURE_SCHEMA`, and a malformed versioned
envelope is never retried as legacy. The temporary production mutation boundary
is `productionImportGate.ts`, which runs before installed-data migration or any
storage read/write.

## Sequential migration registry

The caller supplies a positive integer current version, the complete current
envelope schema, and one registered step for each supported source version.
Every step advances exactly one version:

```ts
type BackupMigration<TFrom, TTo> = (input: TFrom) => TTo
```

```text
parse schemaVersion N
  -> input validation for N
  -> pure migration N to N+1
  -> output validation for N+1
  -> repeat until current
  -> current schema validation
```

The registry rejects gaps and steps that skip a version. A migration function
receives parsed source data, performs no I/O, and returns only the next envelope
shape. There is no giant migration that maps every historical version directly
to current.

Input and output schemas are both required even when adjacent shapes look
similar. This prevents a migration from sending malformed data into the next
step and makes the failure boundary deterministic.

## Typed rejection

The public failure codes are:

- `UNSUPPORTED_FUTURE_SCHEMA`: `schemaVersion` is greater than the caller's
  current version.
- `UNSUPPORTED_SCHEMA_VERSION`: the version is older than the supported range
  or has no registered step.
- `INVALID_SCHEMA`: envelope detection, step input validation, step output
  validation, or final current validation failed.

A future version is never best-effort parsed as current. Error messages carry
only safe version diagnostics and never include backup payloads, Zod issues, URL
values, notes, prompts, attachments, or other user content.

## Current-schema idempotence

When input already declares the current version, the pipeline validates it with
the current schema and invokes no migration function.

```text
migrateToCurrent(current) preserves current logical semantics
```

Object identity is not required because runtime validation may clone the value.
Issue #718 can extend this semantic invariant with deterministic property-based
tests once #730 provides the concrete current Backup V2 data generator.

## Adding a schema version

To add one supported version:

1. Define the next immutable envelope schema without changing the previous
   schema.
2. Add one pure `N -> N+1` migration.
3. Register the source schema, migration, and target schema under version `N`.
4. Set the caller-owned current version and current schema to `N+1`.
5. Add golden fixtures for the new current, previous current, future, and
   malformed shapes.
6. Prove input validation, output validation, sequential call order, future
   rejection, and current-schema idempotence.
7. Update the supported range in user-facing compatibility documentation.

Do not rewrite old schemas to match the new shape. Do not add application-semver
branches or direct old-to-current shortcuts.

## Pre-IndexedDB compatibility lifecycle

Schema-less backups with the legacy `version` field are not members of the
versioned registry. #730 owns a dedicated temporary legacy importer and maps a
validated legacy backup to current logical backup data before current-schema
validation.

The target support policy is:

- legacy pre-IndexedDB backup import is available through `2026-08-31`;
- #734 removes the legacy parser, mapper, detector branch, fixtures, deadline
  constants, and temporary UI branch from `2026-09-01`;
- the parent policy still requires at least 30 days after the production notice
  release, so a late notice release postpones the cutoff consistently across
  #724, #730, #731, #734, docs, i18n, constants, and tests.

The central dates and notice calculation are defined only in
`compatibility/legacyBackupPolicy.ts`:

| Policy value                  | Date / rule  |
| ----------------------------- | ------------ |
| Last supported import date    | `2026-08-31` |
| Cutoff date                   | `2026-09-01` |
| Latest on-time notice release | `2026-08-01` |
| Minimum notice                | 30 days      |

Legacy preview metadata carries a content-free advisory with
`requiresReExport: true`, `lastSupportedDate`, and `cutoffDate`. Notice rendering
and translations belong to #731, not this persistence contract.

The live installed-data `chrome.storage.local` to IndexedDB migration has a
separate lifecycle and is not deleted by the backup cutoff.

## Production import rollout gate

Current Backup V2 overwrite and a valid legacy overwrite before the cutoff now
route through the recovery-backed `ImportBackupV2UseCase`. The use case must
persist a consistent logical recovery snapshot before opening the replacement
transaction; capture, capacity, retention, or persistence failure blocks the
overwrite. Current V2 merge remains fail-closed with
`CURRENT_V2_MERGE_UNAVAILABLE`; a valid legacy merge before the cutoff continues
through the temporary merge route. Versioned input is inspected before routing
so future and invalid schemas retain their typed schema errors.

An allowed legacy merge is converted by `LegacyBackupAdapter` and committed as
strict IndexedDB `put` mutations through `IndexedDbPersistenceUnitOfWork`.
Existing logical records are not cleared, and the actual persistence operation
gate must authorize the `indexeddb` route. The merge never falls back to
`chrome.storage.local` domain writes after IndexedDB cutover; user settings
remain the separately owned cross-engine write.

`ImportBackupV2UseCase.ts` owns the production overwrite transaction and
readback contract, including the unavoidable separate settings write. Recovery
data is local-only, is strictly parsed before restore, and is never included in
the public backup, diagnostics, logs, or change-event payload. Legacy, future,
expired-legacy, and invalid versioned inputs are classified before mutation;
the compatibility parser remains isolated under `import-export/legacy/`.

`PreImportRecoverySnapshotService` holds the pre-restore logical state and
settings in memory before replacement. A settings-write or target-readback
failure after commit runs a second strict replacement to re-establish that
state, writes the prior settings, verifies both stores, and returns a fixed
typed failure containing only compensation metadata. Post-commit change-ID or
publication failure is instead typed partial success retaining the committed
revision, scopes, and failed notification stage.

## Validation and review checklist

- `appVersion`, `schemaVersion`, and `databaseVersion` remain separate.
- Every supported older version has exactly one sequential step.
- Every step performs input validation and output validation.
- Current input performs validation but no migration.
- Future input is rejected with `UNSUPPORTED_FUTURE_SCHEMA`.
- Unsupported old input is rejected with `UNSUPPORTED_SCHEMA_VERSION`.
- Invalid data is rejected with `INVALID_SCHEMA`.
- Legacy detection does not import or migrate legacy data.
- Every production overwrite enters the recovery-backed use case before
  mutation.
- A restore failure after replacement either verifies compensation or returns
  `RECOVERY_COMPENSATION_FAILED`; it does not silently leave a mixed state.
- Recovery notification failure retains committed revision and scopes as typed
  partial success.
- Current V2 merge remains fail-closed until its own rollout contract exists.
- Settings are documented as a separate cross-engine write.
- Logical resource validation precedes serialized-byte validation.
- Golden fixtures cover each supported version, current, future, and invalid
  data.
- The public backup remains a logical JSON-safe contract rather than an
  IndexedDB dump.
