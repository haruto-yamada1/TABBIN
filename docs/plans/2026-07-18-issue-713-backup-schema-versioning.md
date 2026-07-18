# Issue #713 Backup Schema Versioning Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a generic, validated, sequential backup-schema migration pipeline that separates backup `schemaVersion` from application and IndexedDB versions without pre-empting Issue #730's concrete Backup V2 model.

**Architecture:** Put the reusable envelope, format detector, typed errors, and migration registry in `src/lib/persistence`. Callers provide the current version and Zod schemas; the pipeline detects legacy input without migrating it, rejects unsupported versions, validates both sides of every pure migration step, and bypasses migrations for current input. Golden fixtures prove a V2 -> V3 -> V4 example while production version ownership remains with #730.

**Tech Stack:** TypeScript, Zod 4, Vitest 4, Bun, oxfmt, Oxlint

---

### Task 1: Define envelope detection and typed schema errors with TDD

**Files:**

- Create: `src/lib/persistence/backupSchema.test.ts`
- Create later: `src/lib/persistence/backupSchema.ts`

**Step 1: Write the failing format-detection tests**

Create `backupSchema.test.ts` with tests that express the public API before the
implementation exists:

```ts
import { describe, expect, it } from 'vitest'

import { BackupSchemaError, detectBackupFormat } from './backupSchema'

describe('detectBackupFormat', () => {
  it('detects a versioned envelope from an integer schemaVersion', () => {
    expect(
      detectBackupFormat({
        appVersion: '2.0.0',
        data: {},
        exportedAt: '2026-07-18T00:00:00.000Z',
        schemaVersion: 2,
      }),
    ).toEqual({ kind: 'versioned', schemaVersion: 2 })
  })

  it('classifies an object without schemaVersion as legacy', () => {
    expect(detectBackupFormat({ version: '2.0.0' })).toEqual({
      kind: 'legacy',
    })
  })

  it.each([null, [], 'backup', { schemaVersion: 0 }, { schemaVersion: 1.5 }])(
    'rejects malformed envelope input %#',
    (input) => {
      expect(() => detectBackupFormat(input)).toThrow(
        expect.objectContaining<Partial<BackupSchemaError>>({
          code: 'INVALID_SCHEMA',
        }),
      )
    },
  )
})
```

Add a second test confirming the error message contains no serialized user
payload:

```ts
it('keeps user data out of typed error messages', () => {
  const secret = 'private-user-backup-value'

  expect(() => detectBackupFormat({ schemaVersion: secret })).toThrowError(
    expect.not.objectContaining({ message: expect.stringContaining(secret) }),
  )
})
```

**Step 2: Run the test and verify RED**

Run:

```bash
bunx vitest run src/lib/persistence/backupSchema.test.ts
```

Expected: FAIL because `./backupSchema` does not exist.

**Step 3: Implement the minimal envelope contract**

Create `backupSchema.ts` with:

```ts
export type BackupEnvelope<TData, TVersion extends number = number> = {
  readonly appVersion: string
  readonly data: TData
  readonly exportedAt: string
  readonly schemaVersion: TVersion
}

export const BACKUP_SCHEMA_ERROR_CODES = [
  'INVALID_SCHEMA',
  'UNSUPPORTED_FUTURE_SCHEMA',
  'UNSUPPORTED_SCHEMA_VERSION',
] as const

export type BackupSchemaErrorCode = (typeof BACKUP_SCHEMA_ERROR_CODES)[number]

const BACKUP_SCHEMA_ERROR_MESSAGES: Readonly<
  Record<BackupSchemaErrorCode, string>
> = {
  INVALID_SCHEMA: 'Backup schema is invalid',
  UNSUPPORTED_FUTURE_SCHEMA: 'Backup schema is newer than supported',
  UNSUPPORTED_SCHEMA_VERSION: 'Backup schema version is unsupported',
}

export class BackupSchemaError extends Error {
  readonly code: BackupSchemaErrorCode
  readonly currentVersion?: number
  readonly receivedVersion?: number

  constructor(
    code: BackupSchemaErrorCode,
    versions: {
      readonly currentVersion?: number
      readonly receivedVersion?: number
    } = {},
  ) {
    super(BACKUP_SCHEMA_ERROR_MESSAGES[code])
    this.name = 'BackupSchemaError'
    this.code = code
    this.currentVersion = versions.currentVersion
    this.receivedVersion = versions.receivedVersion
  }
}

export type BackupFormatDetection =
  | { readonly kind: 'legacy' }
  | { readonly kind: 'versioned'; readonly schemaVersion: number }

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const detectBackupFormat = (input: unknown): BackupFormatDetection => {
  if (!isRecord(input)) {
    throw new BackupSchemaError('INVALID_SCHEMA')
  }
  if (!Object.hasOwn(input, 'schemaVersion')) {
    return { kind: 'legacy' }
  }
  const schemaVersion = input.schemaVersion
  if (
    !Number.isSafeInteger(schemaVersion) ||
    typeof schemaVersion !== 'number' ||
    schemaVersion < 1
  ) {
    throw new BackupSchemaError('INVALID_SCHEMA')
  }
  return { kind: 'versioned', schemaVersion }
}
```

Let oxfmt decide final line wrapping and import order.

**Step 4: Run the test and verify GREEN**

Run the same targeted Vitest command.

Expected: all `backupSchema.test.ts` tests PASS with no warnings.

**Step 5: Commit the envelope contract**

```bash
git add src/lib/persistence/backupSchema.ts \
  src/lib/persistence/backupSchema.test.ts
git commit -m "feat: backup schema envelope を定義"
```

### Task 2: Add golden fixtures and the sequential registry with TDD

**Files:**

- Create: `src/lib/persistence/__fixtures__/backup-schema/backup-v2.json`
- Create: `src/lib/persistence/__fixtures__/backup-schema/backup-v3.json`
- Create: `src/lib/persistence/__fixtures__/backup-schema/backup-current.json`
- Create: `src/lib/persistence/__fixtures__/backup-schema/backup-future.json`
- Create: `src/lib/persistence/__fixtures__/backup-schema/backup-invalid.json`
- Create: `src/lib/persistence/backupMigrationPipeline.test.ts`
- Create later: `src/lib/persistence/backupMigrationPipeline.ts`

**Step 1: Add deterministic golden fixture shapes**

Use the same metadata across fixtures. The logical test-only schema evolves as:

```text
V2 data: { name: string }
V3 data: { collection: { name: string } }
V4 data: { collections: [{ name: string }] }
```

`backup-future.json` uses `schemaVersion: 5`. `backup-invalid.json` declares V3
but omits `collection.name`. Keep every fixture free of production user data.

**Step 2: Write the failing migration tests**

In `backupMigrationPipeline.test.ts`:

- import each JSON fixture;
- define strict V2, V3, and V4 Zod envelope schemas;
- define `migrateV2ToV3` and `migrateV3ToV4` as pure functions;
- create a registry with keys 2 and 3 and current version 4;
- assert V2 calls both migrations in order and equals the current fixture;
- assert V3 calls only V3 -> V4;
- assert current calls neither migration and preserves semantic data;
- assert future throws `UNSUPPORTED_FUTURE_SCHEMA` with received/current versions;
- assert version 1 throws `UNSUPPORTED_SCHEMA_VERSION`;
- assert the invalid fixture throws `INVALID_SCHEMA` before migration;
- assert a migration producing invalid target data throws `INVALID_SCHEMA`;
- assert a missing or non-sequential registry step is rejected at construction;
- assert legacy input returns `{ kind: 'legacy' }` without invoking migration.

The intended API is:

```ts
const pipeline = createBackupMigrationPipeline({
  currentSchema: backupV4Schema,
  currentVersion: 4,
  migrations: new Map([
    [
      2,
      {
        fromVersion: 2,
        inputSchema: backupV2Schema,
        migrate: migrateV2ToV3,
        outputSchema: backupV3Schema,
        toVersion: 3,
      },
    ],
    [
      3,
      {
        fromVersion: 3,
        inputSchema: backupV3Schema,
        migrate: migrateV3ToV4,
        outputSchema: backupV4Schema,
        toVersion: 4,
      },
    ],
  ]),
})
```

**Step 3: Run the migration test and verify RED**

Run:

```bash
bunx vitest run src/lib/persistence/backupMigrationPipeline.test.ts
```

Expected: FAIL because `backupMigrationPipeline.ts` does not exist.

**Step 4: Implement the minimal registry and pipeline**

Create types equivalent to:

```ts
import type { z } from 'zod'

import { BackupSchemaError, detectBackupFormat } from './backupSchema'

export type BackupMigration<TFrom, TTo> = (input: TFrom) => TTo

export type BackupMigrationStep<TFrom = unknown, TTo = unknown> = {
  readonly fromVersion: number
  readonly inputSchema: z.ZodType<TFrom>
  readonly migrate: BackupMigration<TFrom, TTo>
  readonly outputSchema: z.ZodType<TTo>
  readonly toVersion: number
}

export type BackupMigrationResult<TCurrent> =
  | { readonly kind: 'legacy' }
  | {
      readonly backup: TCurrent
      readonly kind: 'current'
      readonly sourceVersion: number
    }
```

`createBackupMigrationPipeline` must:

1. require a positive safe-integer current version;
2. reject registry keys that do not equal `fromVersion`;
3. require `toVersion === fromVersion + 1`;
4. require every key from the minimum registered version through
   `currentVersion - 1`;
5. return legacy classification before any migration;
6. reject versions greater than current as future;
7. reject an older version without a registry entry as unsupported;
8. use `safeParse` for the current schema and both schemas around each step;
9. translate every Zod failure into `BackupSchemaError('INVALID_SCHEMA')`;
10. return the final parsed current value and original source version.

Do not expose Zod issues or the backup payload in thrown messages.

**Step 5: Run the focused tests and verify GREEN**

Run:

```bash
bunx vitest run \
  src/lib/persistence/backupSchema.test.ts \
  src/lib/persistence/backupMigrationPipeline.test.ts
```

Expected: both files PASS.

**Step 6: Commit the migration kernel**

```bash
git add src/lib/persistence/backupMigrationPipeline.ts \
  src/lib/persistence/backupMigrationPipeline.test.ts \
  src/lib/persistence/__fixtures__/backup-schema
git commit -m "feat: backup schema migration pipeline を追加"
```

### Task 3: Document and protect the compatibility policy

**Files:**

- Create: `docs/architecture/backup-schema-versioning.md`
- Create: `src/lib/architecture/backupSchemaVersioningPolicy.test.ts`
- Modify: `docs/architecture/persistence-model-v2.md`

**Step 1: Write the failing architecture policy test**

Read both architecture documents using the same `repoRoot` convention as
`persistenceModelV2Policy.test.ts`. Assert that the new document contains:

```text
appVersion
schemaVersion
databaseVersion
UNSUPPORTED_FUTURE_SCHEMA
UNSUPPORTED_SCHEMA_VERSION
INVALID_SCHEMA
input validation
output validation
current-schema idempotence
2026-08-31
#730
#734
```

Also assert that `persistence-model-v2.md` links to
`./backup-schema-versioning.md`.

**Step 2: Run the policy test and verify RED**

Run:

```bash
bunx vitest run src/lib/architecture/backupSchemaVersioningPolicy.test.ts
```

Expected: FAIL because the architecture document and link do not exist.

**Step 3: Write the operational architecture document**

Cover the approved design exactly:

- three separate version domains and owners;
- caller-owned current version and registry;
- legacy/versioned detection;
- sequential input -> migrate -> output validation;
- typed rejection and no best-effort future parsing;
- no migrations for current input;
- one-step procedure for adding a supported schema version;
- #730 dedicated pre-IDB importer through 2026-08-31;
- #734 removal from 2026-09-01 subject to the parent notice policy;
- Backup V2 as logical JSON-safe data, never an IndexedDB dump.

Add one relative link from the Backup V2 section in
`persistence-model-v2.md`.

**Step 4: Run the policy and migration tests and verify GREEN**

Run:

```bash
bunx vitest run \
  src/lib/architecture/backupSchemaVersioningPolicy.test.ts \
  src/lib/persistence/backupSchema.test.ts \
  src/lib/persistence/backupMigrationPipeline.test.ts
```

Expected: all three files PASS.

**Step 5: Commit documentation and policy protection**

```bash
git add docs/architecture/backup-schema-versioning.md \
  docs/architecture/persistence-model-v2.md \
  src/lib/architecture/backupSchemaVersioningPolicy.test.ts
git commit -m "docs: backup schema compatibility policy を追加"
```

### Task 4: Verify acceptance criteria and repository gates

**Files:**

- Modify only if verification finds an Issue-owned defect.

**Step 1: Format the Issue-owned files**

Run oxfmt on the exact changed paths, then inspect `git diff --check` and the
Issue-owned diff.

**Step 2: Run targeted node tests**

```bash
bunx vitest run \
  src/lib/persistence/backupSchema.test.ts \
  src/lib/persistence/backupMigrationPipeline.test.ts \
  src/lib/architecture/backupSchemaVersioningPolicy.test.ts
```

Expected: all tests PASS with no warnings.

**Step 3: Run the node project**

```bash
bun run test:node
```

Expected: all node tests PASS.

**Step 4: Run coverage**

```bash
bun run test:coverage
```

Expected: exit 0 and repository-required 100% coverage.

**Step 5: Run the broad quality gate**

```bash
bun run quality:check
```

Expected: format, tooling verification, compile, lint, tests, Knip,
duplication, secretlint, and architecture checks all exit 0.

**Step 6: Validate and audit the harness**

Record checkpoints for the targeted tests and broad gates, then run:

```bash
bun run harness:validate
bun run harness:audit
```

Expected: schemas valid and no unresolved blocking findings.

**Step 7: Commit any verification-only corrections**

Stage only Issue-owned paths and use a scoped Japanese commit message. Do not
create an empty commit.

### Task 5: Publish the standalone Issue implementation

**Step 1: Verify the final diff and clean-tree commit state**

Confirm every changed path belongs to Issue #713 and the worktree is clean.

**Step 2: Run the clean-tree release gate**

```bash
bun run release:check
```

Expected: exit 0 on a clean committed tree.

**Step 3: Push normally**

```bash
git push -u origin codex/issue-713-backup-schema-versioning
```

Do not force-push.

**Step 4: Create or reuse one Open PR**

Query all PR states for the exact head branch. If no matching Open PR exists,
create a non-draft PR against `develop` whose body includes cause, changes,
acceptance mapping, verification results, risk, and `Closes #713`.

**Step 5: Verify live publication state**

Confirm the PR is `OPEN`, `isDraft: false`, base `develop`, and local HEAD equals
the remote branch. Report the commit hash, branch, PR URL, and synchronization
result.
