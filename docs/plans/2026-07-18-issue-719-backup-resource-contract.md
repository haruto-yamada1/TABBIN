# Issue #719 Backup Resource Contract Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use test-driven-development to implement
> this plan task-by-task in the active harness run.

**Goal:** Define one executable Backup V2 resource envelope that preserves the
`import(export(x))` contract, replace the arbitrary 10 MiB import cap, and hand
the same policy to #730 and #740.

**Architecture:** Keep the policy independent of the future Backup V2 schema by
validating numeric usage metrics in `src/lib/persistence`. Promote the existing
AI attachment limits to shared constants, use the serialized-byte policy in the
current import/export boundary, and protect the complete contract in the
authoritative Persistence Model v2 document.

**Tech Stack:** TypeScript, Vitest, React Testing Library, Zod-compatible typed
results, TABBIN harness.

---

### Task 1: RED for the executable resource policy

**Files:**

- Create: `src/lib/persistence/backupResourcePolicy.test.ts`
- Create later: `src/lib/persistence/backupResourcePolicy.ts`
- Create later: `src/constants/aiChatLimits.ts`

**Steps:**

1. Add tests for an exact supported envelope, each typed failure category,
   invalid metrics, attachment-limit sharing, and content-free diagnostics.
2. Run `bunx vitest run src/lib/persistence/backupResourcePolicy.test.ts`.
3. Confirm RED because the policy module does not exist.
4. Record the RED command and failure in the harness checkpoint.

### Task 2: GREEN for the shared policy

**Files:**

- Create: `src/constants/aiChatLimits.ts`
- Create: `src/lib/persistence/backupResourcePolicy.ts`
- Modify: `src/features/ai-chat/lib/attachments.ts`
- Modify: `src/features/ai-chat/components/SavedTabsChatComposer.tsx`
- Modify: `src/features/ai-chat/components/savedTabsChat/streaming.ts`

**Steps:**

1. Move the existing five-attachment and 2 MiB constants to the shared constants
   module and update all production consumers.
2. Add the resource limits, typed result/error, deterministic validation order,
   byte-label helper, and recovery retention policy.
3. Run the policy test and confirm GREEN with clean output.
4. Run the existing attachment tests to prove no upload behavior changed.

### Task 3: RED/GREEN for current import and export preflight

**Files:**

- Modify: `src/features/options/ImportExportSettings.test.tsx`
- Modify: `src/features/options/ImportFileDialog.tsx`
- Modify: `src/features/options/lib/import-export.test.ts`
- Modify: `src/features/options/lib/import-export/flows.ts`

**Steps:**

1. Replace the old 10 MiB rejection test with two tests: 10 MiB plus one byte is
   read, and the shared limit plus one byte is rejected before `FileReader`.
2. Run the DOM test and confirm RED against the local 10 MiB constant.
3. Use `validateBackupSerializedBytes` and the shared label in the import UI.
4. Add export regressions for compact serialization and the typed
   serialized-byte preflight, then apply the same policy before creating the
   downloadable Blob.
5. Run the focused DOM and import/export tests and confirm GREEN.

### Task 4: Protect the authoritative contract

**Files:**

- Modify: `docs/architecture/persistence-model-v2.md`
- Modify: `src/lib/architecture/persistenceModelV2Policy.test.ts`
- Keep: `docs/plans/2026-07-18-issue-719-backup-resource-contract-design.md`

**Steps:**

1. Add a failing architecture test for the resource-envelope heading, limits,
   typed errors, 128 MiB decision, benchmark evidence, and recovery capacity.
2. Run the policy test and confirm RED.
3. Add the approved contract to the architecture document and update the #719
   handoff so #730 must use the executable validator for both directions.
4. Run the architecture test and confirm GREEN.

### Task 5: Targeted and repository-wide verification

**Files:**

- Modify only if failures reveal Issue-owned defects.

**Steps:**

1. Run focused policy, import/export, attachment, and architecture tests.
2. Run `bun run compile` and `bun run test:node` or `bun run test:dom` as
   appropriate for the changed boundaries.
3. Run `bun run test:coverage` and confirm 100% repository coverage.
4. Run `bun run quality:check`.
5. Record every command in harness checkpoints, then run
   `bun run harness:validate` and `bun run harness:audit`.

### Task 6: Publish the standalone Issue implementation

**Files:**

- Stage only Issue #719-owned paths.

**Steps:**

1. Review the final diff and clean status against baseline `5fb07885`.
2. Commit with a scoped Japanese message.
3. Run `bun run release:check` on the clean commit.
4. Push `codex/issue-719-backup-resource-contract` normally.
5. Create or reuse the matching non-draft PR to `develop` with
   `Closes #719`, risks, and verification evidence.
6. Verify the PR state and local/origin branch synchronization live.
