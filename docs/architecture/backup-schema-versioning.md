# Backup Schema Versioning

Status: public migration-kernel contract for Issue #713  
Parent: Issue #724  
Production Backup V2 owner: Issue #730

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

The concrete current `data` schema and production current version belong to
#730. Components and mappers consume the caller-owned schema registry; they do
not duplicate a schema-version magic number.

Backup V2 is a logical, JSON-safe projection selected by the Storage Placement
Matrix. It is never an IndexedDB database, object-store, index, cache, migration
metadata, or transaction log dump.

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

The live installed-data `chrome.storage.local` to IndexedDB migration has a
separate lifecycle and is not deleted by the backup cutoff.

## Validation and review checklist

- `appVersion`, `schemaVersion`, and `databaseVersion` remain separate.
- Every supported older version has exactly one sequential step.
- Every step performs input validation and output validation.
- Current input performs validation but no migration.
- Future input is rejected with `UNSUPPORTED_FUTURE_SCHEMA`.
- Unsupported old input is rejected with `UNSUPPORTED_SCHEMA_VERSION`.
- Invalid data is rejected with `INVALID_SCHEMA`.
- Legacy detection does not import or migrate legacy data.
- Golden fixtures cover each supported version, current, future, and invalid
  data.
- The public backup remains a logical JSON-safe contract rather than an
  IndexedDB dump.
