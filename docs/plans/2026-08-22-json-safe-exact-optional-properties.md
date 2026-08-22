# JSON-safe Optional Properties Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persistence V2 の optional property を runtime と compile time の両方で厳密化し、JSON-safe write failure を再発防止する。

**Architecture:** Domain factory は所有する既知の optional field のみを canonicalize し、IndexedDB 直前の fail-closed validation は維持する。その後 `exactOptionalPropertyTypes` を repository 全体で有効化し、property の存在意味に応じて object construction または型契約を修正する。

**Tech Stack:** TypeScript, React, Bun, Vitest, WXT, tsgo, Oxlint, oxfmt

---

### Task 1: Runtime JSON-safe regression tests

**Files:**

- Modify: `src/contexts/saved-tabs/domain/entities/TabGroup.test.ts`
- Modify: `src/contexts/saved-tabs/domain/entities/CustomProject.test.ts`
- Modify: `src/contexts/saved-tabs/domain/entities/UrlRecord.test.ts`
- Modify: `src/contexts/saved-tabs/domain/value-objects/SavedAt.test.ts`

**Step 1: Write failing tests**

- normalized `TabGroup` inputに `groupId: undefined` と membership の
  `addedAtProvenance/categoryId/notes: undefined` を渡し、返却値が各 property を
  own property として持たないことを検証する。
- normalized `CustomProject` に同じ optional membership と
  `groupId: undefined` を渡し、property 不在を検証する。
- favicon を省略した `UrlRecord` が `favIconUrl` property を持たないことを
  検証する。
- `createSavedAt(-0)` が `SavedTabsDomainError` を投げることを検証する。

**Step 2: Run tests to verify they fail**

Run:

```bash
bun run test:node -- \
  src/contexts/saved-tabs/domain/entities/TabGroup.test.ts \
  src/contexts/saved-tabs/domain/entities/CustomProject.test.ts \
  src/contexts/saved-tabs/domain/entities/UrlRecord.test.ts \
  src/contexts/saved-tabs/domain/value-objects/SavedAt.test.ts
```

Expected: new explicit-undefined and negative-zero tests fail for the current implementation.

### Task 2: Runtime canonicalization implementation

**Files:**

- Modify: `src/contexts/saved-tabs/domain/entities/TabGroup.ts`
- Modify: `src/contexts/saved-tabs/domain/entities/CustomProject.ts`
- Modify: `src/contexts/saved-tabs/domain/entities/UrlRecord.ts`
- Modify: `src/contexts/saved-tabs/domain/value-objects/SavedAt.ts`

**Step 1: Canonicalize collection groupId**

Destructure `groupId` out of the source collection before rebuilding it, and add the
validated value only when it is defined. Apply the same omitted-property contract when
assignment is cleared.

**Step 2: Canonicalize membership optional fields**

Destructure `addedAtProvenance`, `categoryId`, and `notes` before rebuilding each
membership. Re-add each field only when it is not `undefined`; preserve all required
fields and keep invalid non-JSON values visible to the fail-closed boundary.

**Step 3: Canonicalize UrlRecord and SavedAt**

Build `favIconUrl` only when defined. Add `Object.is(value, -0)` to the invalid
`SavedAt` condition without rejecting positive zero.

**Step 4: Run focused tests**

Run the Task 1 command.

Expected: all focused tests pass.

**Step 5: Verify and commit B**

Run:

```bash
bun run test
bun run quality:check
bun run test:coverage
git diff --check
```

Commit only the runtime files, tests, and these plan documents:

```bash
git add docs/plans/2026-08-22-json-safe-exact-optional-properties-design.md \
  docs/plans/2026-08-22-json-safe-exact-optional-properties.md \
  src/contexts/saved-tabs/domain/entities/TabGroup.ts \
  src/contexts/saved-tabs/domain/entities/TabGroup.test.ts \
  src/contexts/saved-tabs/domain/entities/CustomProject.ts \
  src/contexts/saved-tabs/domain/entities/CustomProject.test.ts \
  src/contexts/saved-tabs/domain/entities/UrlRecord.ts \
  src/contexts/saved-tabs/domain/entities/UrlRecord.test.ts \
  src/contexts/saved-tabs/domain/value-objects/SavedAt.ts \
  src/contexts/saved-tabs/domain/value-objects/SavedAt.test.ts
git commit -m "JSON安全なoptional値の生成境界を強化"
```

### Task 3: Enable exactOptionalPropertyTypes and inventory errors

**Files:**

- Modify: `tsconfig.json`

**Step 1: Enable the flag**

Add `"exactOptionalPropertyTypes": true` under `compilerOptions`.

**Step 2: Verify the expected compile failure**

Run:

```bash
bun run compile
```

Expected baseline: compile fails with exact-optional errors. The pre-change audit found
379 errors across 158 files; do not treat a different count as success without explaining
the delta.

**Step 3: Partition by non-overlapping write sets**

- Shared UI and generic product code: `src/components/**` and saved-tabs以外の `src/**`
- Saved-tabs core: `src/contexts/saved-tabs/application/**`, `domain/**`,
  `infrastructure/**`
- Saved-tabs presentation and test fixtures: `src/contexts/saved-tabs/presentation/**`,
  `testing/**`
- Repository surfaces: root configs, `tests/**`, `tools/**`, `e2e/**`

Each worker must run compile after its edits and report only remaining errors outside its
write set. Workers must not commit.

### Task 4: Fix exact optional errors semantically

**Files:**

- Modify: files reported by `bun run compile` within each Task 3 write set

**Step 1: Omit absent values**

For props, options, DTOs, persistence records, and third-party config where absence is
the intended state, replace `{ property: maybeUndefined }` with a conditional spread.

**Step 2: Model present undefined explicitly**

For mutable state or context values whose key is always present, use
`property: T | undefined`. Use `property?: T | undefined` only when callers are
contractually allowed both omission and explicit undefined.

**Step 3: Keep external boundaries strict**

Do not add broad assertions, lint suppression, compiler exclusion, or a repository-wide
`| undefined` mechanical rewrite. Preserve third-party prop semantics and React controlled
state behavior.

**Step 4: Iterate compile to zero**

Run:

```bash
bun run compile
```

Expected: exit 0 with no TypeScript errors.

### Task 5: Verify and commit C

**Files:**

- Modify: `tsconfig.json`
- Modify: all semantically corrected exact-optional call sites and type declarations

**Step 1: Run focused tests for behavior-sensitive edits**

Use `bun run test:node -- <files>` or `bun run test:dom -- <files>` for each changed
behavior-sensitive cluster before the broad gates.

**Step 2: Run broad gates**

```bash
bun run compile
bun run test
bun run quality:check
bun run test:coverage
git diff --check
```

Expected: all commands exit 0 and coverage thresholds remain unchanged.

**Step 3: Commit C separately**

```bash
git add tsconfig.json src tests tools e2e playwright.config.ts wxt.config.ts
git commit -m "optionalプロパティ型を厳密化"
```

Before committing, inspect staged paths and exclude unrelated or generated files.

### Task 6: Fresh-context evaluation and harness completion

**Files:**

- Modify: `.agents/harness/runs/<active-run>/generator.json`
- Modify: `.agents/harness/runs/<active-run>/evaluator.json`
- Modify: `.agents/harness/runs/<active-run>/orchestrator.json`

**Step 1: Record implementation evidence**

Record B/C commit hashes and verification results in `generator.json`.

**Step 2: Run a fresh-context evaluator**

Review runtime JSON safety, exact optional semantics, preservation of persistence
boundaries, and staged commit separation. Resolve every valid finding before completion.

**Step 3: Validate harness state**

```bash
bun run harness:audit
bun run harness:validate
```

**Step 4: Confirm final branch state**

```bash
git status --short --branch
git log -3 --oneline --decorate
```

Expected: worktree clean with separate B and C commits on
`codex/json-safe-exact-optional-properties`.
