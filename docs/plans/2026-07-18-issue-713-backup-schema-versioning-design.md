# Issue #713 Backup Schema Versioning Design

## Context

The current options backup stores the extension manifest version in
`BackupData.version`. Import validates that legacy shape directly, so the
application release version and the public backup schema version are the same
field in practice.

Persistence Model v2 requires three independent version domains:

- `appVersion`: extension release version used for diagnostics and provenance.
- `schemaVersion`: public import/export contract version used for dispatch.
- IndexedDB `databaseVersion`: physical object-store and index upgrade version.

Issue #730 owns the concrete Backup V2 logical data model and its production
import/export integration. Issue #713 must therefore provide the reusable
versioned envelope and migration mechanism without defining that logical model
early or mixing the pre-IndexedDB compatibility importer into the current
pipeline.

## Goals

- Define a generic immutable `BackupEnvelope` carrying `schemaVersion`,
  `appVersion`, `exportedAt`, and logical `data`.
- Detect a versioned envelope before parsing version-specific data.
- Run supported migrations sequentially through a registry.
- Validate each step's input and output schema.
- Reject future, unsupported, and invalid schemas with typed error codes.
- Treat current-schema input as an idempotent validation path with no migration.
- Keep schema-less pre-IndexedDB backups outside the versioned migration
  registry.
- Provide deterministic golden fixtures proving V2 -> V3 -> current behavior.

## Non-goals

- Defining `BackupDataV2` or the complete production Backup V2 schema. That
  remains Issue #730.
- Connecting the current options import/export UI to the new envelope.
- Migrating, importing, or deleting pre-IndexedDB backup formats.
- Exposing IndexedDB object-store records as backup data.
- Using semver comparison to decide backup compatibility.

## Considered approaches

### Generic migration kernel with a caller-owned schema registry

The migration module owns only the envelope, dispatch, validation, errors, and
sequential execution. A caller such as Issue #730 supplies the current version,
current schema, and ordered migration steps.

This keeps the public mechanism testable now while preserving #730 as the
source of truth for the actual Backup V2 model. This is the selected approach.

### Define Backup V2 in Issue #713

This would allow immediate production integration, but duplicates #730's
logical-model responsibility and risks defining the contract before the
IndexedDB query and mapper boundaries exist.

### Declare V4 as the production current schema

This follows the illustrative V2 -> V3 -> V4 sequence literally, but conflicts
with #730's explicit Backup V2 contract. The sequence belongs in golden tests,
not in production version declarations.

## Module boundaries

The cross-cutting public contract lives in `src/lib/persistence/`, beside the
JSON-safe and backup resource policies:

- `backupSchema.ts`: envelope types, format detection, typed errors, and public
  schema definitions for the version header.
- `backupMigrationPipeline.ts`: registry types, construction-time invariants,
  sequential migration, and current-schema validation.
- `backupMigrationPipeline.test.ts`: behavior tests using the golden fixtures.
- `__fixtures__/backup-schema/`: V2, V3, current, future, and invalid JSON.

The production module does not import from `features/options`. The future
legacy importer stays under the dedicated #730 boundary and may call the same
current-schema validator only after it has produced current logical backup
data.

## Public contract

```ts
type BackupEnvelope<TData, TVersion extends number = number> = {
  readonly schemaVersion: TVersion
  readonly appVersion: string
  readonly exportedAt: string
  readonly data: TData
}

type BackupMigration<TFrom, TTo> = (input: TFrom) => TTo

type BackupSchemaErrorCode =
  | 'INVALID_SCHEMA'
  | 'UNSUPPORTED_FUTURE_SCHEMA'
  | 'UNSUPPORTED_SCHEMA_VERSION'
```

`BackupSchemaError` contains only the code and schema-version diagnostics. It
must not copy user data or raw Zod issues into its message.

Format detection has two successful classifications:

- `versioned`: an object with an integer `schemaVersion` field.
- `legacy`: an object with no `schemaVersion` field.

Malformed JSON or a present but invalid `schemaVersion` is `INVALID_SCHEMA`.
Detection does not parse or migrate legacy data.

## Migration registry

The pipeline is created with:

- one positive integer `currentVersion`;
- one `currentSchema` for the complete current envelope;
- a map keyed by each supported source version below current;
- one step for every version from the minimum supported version to current.

Each step supplies its source envelope schema, target envelope schema, and pure
migration function. Construction rejects gaps, out-of-range keys, and steps
whose declared target is not exactly `source + 1`. This makes sequential
migration a registry invariant instead of a runtime convention.

## Data flow

```text
unknown JSON value
  -> detect format
     -> legacy: return dedicated legacy classification
     -> versioned: read schemaVersion
        -> greater than current: UNSUPPORTED_FUTURE_SCHEMA
        -> below supported range or registry gap:
           UNSUPPORTED_SCHEMA_VERSION
        -> current: validate current schema and return without migration
        -> older supported version:
           validate source
           -> migrate N to N+1
           -> validate target
           -> repeat until current
           -> validate current and return
```

Validation occurs before and after every migration step. The migration callback
does not receive `unknown`; it receives the parsed source schema output. A
failure at any validation boundary becomes `INVALID_SCHEMA`.

## Idempotence

Current input bypasses every migration callback. Its parsed result is returned
with the same logical fields and values. Object identity is not part of the
contract because Zod parsing may clone values; semantic equality is.

The test registry uses V2, V3, and V4-shaped logical fixtures so that Issue #718
can later reuse the same `migrateToCurrent(current)` semantic invariant without
making V4 a production backup version.

## Fixture and test strategy

Golden fixtures are static JSON inputs:

- `backup-v2.json`: requires two sequential migrations.
- `backup-v3.json`: requires one migration.
- `backup-current.json`: validates without migration.
- `backup-future.json`: is rejected with
  `UNSUPPORTED_FUTURE_SCHEMA`.
- `backup-invalid.json`: fails the declared version schema.

TDD starts with tests for envelope detection and typed future rejection, then
adds registry validation, sequential migration, per-step input/output
validation, unsupported-version rejection, current idempotence, and legacy
classification. Tests assert migration call order and semantic output, not
implementation-specific object identity.

An architecture policy test protects the documentation contract: three version
domains, sequential validation, the #730 legacy boundary, and the 2026-08-31
pre-IDB support cutoff.

## Documentation

`docs/architecture/backup-schema-versioning.md` is the operational reference.
It explains:

- the difference between app, backup schema, and database versions;
- the supported-version registry and how to add one migration step;
- future-version rejection;
- current-schema idempotence;
- the pre-IDB compatibility boundary and 2026-08-31 cutoff;
- why Backup V2 is a logical mapper contract rather than an IndexedDB dump.

`docs/architecture/persistence-model-v2.md` links to that reference without
duplicating constants or migration rules.

## Compatibility, security, and rollback

No production import/export path changes in Issue #713, so existing backups and
user data remain untouched. The only runtime surface added is a pure parser and
migration library.

Typed errors contain no backup payload. Future versions are never best-effort
parsed as current. Legacy data is detected but never accepted by the versioned
pipeline, preventing permanent compatibility code from entering the new public
contract.

Rollback is removal of the new unused library, fixtures, and documentation.
Once #730 integrates the library, rollback policy belongs to that production
integration and must preserve existing user backups.
