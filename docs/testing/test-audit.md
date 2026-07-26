# Test Audit

This audit captures the current state of TABBIN tests from the perspective of
meaningful regression protection. It is a working inventory, not a permanent
policy. Keep durable testing policy in
[meaningful-tests.md](./meaningful-tests.md).

## Snapshot

Date: 2026-06-27

Scope excludes generated output, `node_modules`, `.git`, `.agents`, and
`.worktrees`.

- Test files: 296
- Source test files: 292
- E2E files: 2
- Production TypeScript files under `src`: 575
- Test titles: 2824
- `expect(...)` calls: 5869
- Files using React Testing Library or `screen`: 109
- Files using `userEvent`: 1
- Files using only `fireEvent`: 46
- Mock-call-heavy files: 32
- Files with role-based queries: 59
- Files with text queries but no role queries: 19
- Files with coverage-oriented markers: 3

## Existing Strengths

The repository already has useful foundations:

- Architecture and dependency regression tests exist, especially around the
  saved-tabs DDD boundary.
- E2E coverage already includes saved-tabs, options, analytics, and ai-chat
  entrypoint stories.
- Several issue-driven regression tests preserve the reason a behavior matters.
- Storage and background boundaries have substantial test coverage.

These should be reinforced, not replaced wholesale.

## Audit Categories

### Coverage filler

Definition: a test reaches a branch but does not clearly describe the protected
behavior.

Initial candidates:

- `src/features/options/lib/import-export.test.ts`
- `src/lib/storybook/component-coverage.test.ts`
- `tools/harness/state.test.ts`

Recommended action: reinforce or split only when a touched behavior is hard to
read. Do not rewrite all of these at once.

### Mock-only

Definition: a test checks calls but misses observable results such as persisted
state, restored snapshots, visible UI, emitted payloads, or returned domain
values.

Initial high-signal candidates:

- `src/contexts/saved-tabs/presentation/app/SavedTabsApp.test.tsx`
- `src/lib/background/extension-actions.test.ts`
- `src/lib/background/message-handler.test.ts`
- `src/contexts/saved-tabs/presentation/hooks/useProjectManagement.test.tsx`
- `src/lib/background/url-storage.test.ts`
- `src/contexts/saved-tabs/presentation/components/CategoryManagementModal.test.tsx`
- `src/features/options/ImportExportSettings.test.tsx`
- `src/entrypoints/options/main.behavior.test.tsx`

Recommended action: when modifying these areas, add or convert tests so the
primary assertion observes behavior, not only collaborator calls.

### Implementation-detail UI

Definition: a UI test depends on DOM structure, classes, or selectors where a
role, accessible name, or user interaction would express the behavior better.

Initial candidates:

- `src/contexts/saved-tabs/presentation/app/SavedTabsApp.test.tsx`
- `src/contexts/saved-tabs/presentation/components/CategoryManagementModal.test.tsx`
- `src/features/options/ImportExportSettings.test.tsx`
- `src/entrypoints/options/main.behavior.test.tsx`
- `src/components/ai-elements/prompt-input.test.tsx`

Recommended action: prefer `userEvent` and role/accessibility queries when the
test is meant to model user behavior. Keep selector-based assertions only for
true implementation contracts.

### Weak title

Definition: a test name says that something works or renders, but not what
would regress.

Examples observed in the suite include generic titles such as normal creation
or rendering statements. Some of these are acceptable for small value objects,
but UI and flow tests should describe the protected behavior.

Recommended action: rename while touching nearby tests. Avoid title-only churn.

### Oversized scenario

Definition: a file or case is large enough that the protected specification is
hard to discover.

Largest current candidates:

- `src/features/options/lib/import-export.test.ts`
- `src/contexts/saved-tabs/presentation/app/SavedTabsApp.test.tsx`
- `src/lib/storage/projects.test.ts`
- `src/features/analytics/routes/AnalyticsRoute.test.tsx`
- `src/features/ai-chat/components/SavedTabsChatWidget.test.tsx`
- `src/contexts/saved-tabs/presentation/hooks/useProjectManagement.test.tsx`
- `src/lib/background/ai-chat.test.ts`
- `src/contexts/saved-tabs/presentation/components/CategoryManagementModal.test.tsx`
- `src/lib/storage/tabs.test.ts`
- `src/lib/background/url-storage.test.ts`

Recommended action: do not split for file size alone. Split when a behavior has
distinct setup, assertions, or ownership.

### Missing representative flow

Definition: unit or branch tests exist, but the user-relevant flow from action
to persistence, restoration, or recovery is not protected.

Initial areas to inspect first:

- saved-tabs save, search, open, remove, and reload behavior
- ParentCategory deletion and reassignment semantics
- CustomProject deletion, metadata merge, category order, and reload semantics
- import/export/restore with legacy data and placeholder URL generation
- chrome.storage change propagation into saved-tabs state
- ai-chat model failure, stream error, attachment, and history recovery

Recommended action: add a representative integration test before adding more
branch-level cases.

## Priority Candidates

Start with these because they combine product risk with current test weakness:

1. `src/features/options/lib/import-export.test.ts`
   - Risk: data restore and legacy payload behavior.
   - Weakness: oversized scenario and coverage-oriented branches.
   - Action: identify scenario groups, then add clearer integration tests for
     legacy restore and placeholder behavior.
2. `src/contexts/saved-tabs/presentation/app/SavedTabsApp.test.tsx`
   - Risk: saved-tabs is the primary user workflow.
   - Weakness: large file, mock-heavy checks, fireEvent use, and text queries.
   - Action: move critical flows toward user-observable integration tests and
     role-based interaction.
3. `src/contexts/saved-tabs/infrastructure/persistence/savedTabsFlowRegression.test.ts`
   - Risk: this is already close to meaningful regression coverage.
   - Weakness: it should become the model for flow-level assertions, not a
     dumping ground.
   - Action: keep focused and extract reusable scenario fixtures only when they
     preserve readable expectations.
4. `src/lib/background/message-handler.test.ts`
   - Risk: browser extension boundary.
   - Weakness: mock-call-heavy assertions.
   - Action: assert message response contracts and state changes at the adapter
     boundary.
5. `src/features/ai-chat/components/SavedTabsChatWidget.test.tsx`
   - Risk: user recovery when AI chat fails or streams partially.
   - Weakness: large component test surface.
   - Action: separate user-visible recovery states from transport and history
     contract tests.

## Keep / Reinforce / Replace

Use this decision model during actual cleanup:

- Keep tests that clearly document behavior and fail for a meaningful
  regression, even if they are not stylistically perfect.
- Reinforce tests that are mostly useful but rely too much on calls, selectors,
  or hidden setup.
- Replace tests that only exist to touch lines and cannot be tied to behavior,
  domain invariants, or boundary contracts.

## Next Pass

The next audit pass should choose one feature area and produce a concrete map:

- representative flow
- current tests covering it
- missing behavior
- target test layer
- proposed new or rewritten test cases

## First Improvement Slice

Start with import/export/restore.

The first representative scenario is overwrite restore of a mixed legacy and
modern backup. This is the highest-value starting point because overwrite
restore can turn a test gap into user-visible data loss.

Behavior to protect:

- A saved TabGroup with only `urlIds` is restored from backup URL records.
- A missing URL record becomes a placeholder URL instead of dropping the ID
  silently.
- CustomProject data with mixed `urlIds` and `urls` is normalized.
- `customProjectOrder`, `categoryOrder`, and `urlMetadata` survive restore.
- The test name must state that the case is overwrite restore.

Target layer:

- Use an import/export integration test around the current public import
  function.
- Keep E2E to the minimal happy path for import/export UI.
- Add smaller unit tests only for extracted normalization rules when the
  integration test becomes hard to read.
