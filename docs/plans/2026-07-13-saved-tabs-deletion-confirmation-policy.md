# Saved Tabs Deletion Confirmation Policy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Saved Tabs destructive-action defaults explicit and consistent, and remove hidden deletion behavior that cannot be fully undone.

**Architecture:** Define the five action defaults in the Saved Tabs domain and compose them into both domain and storage defaults. Keep Custom-project mutations project-scoped while retaining Domain-mode global deletion as the owner of cross-project cleanup.

**Tech Stack:** TypeScript, React hooks, Vitest, Chrome storage adapter, WXT.

---

### Task 1: Lock the policy with failing tests

**Files:**

- Create: `src/contexts/saved-tabs/domain/services/SavedTabsActionSettingsPolicy.test.ts`
- Modify: `src/contexts/saved-tabs/domain/services/UserSettingsDefaults.test.ts`

1. Assert the exact five defaults, including opt-in external-drop removal.
2. Assert missing settings receive defaults while explicit stored values win.
3. Run the focused node tests and confirm the new contract fails first.

### Task 2: Lock project-scoped deletion with failing tests

**Files:**

- Modify: `src/lib/storage/projects.test.ts`
- Modify: `src/contexts/saved-tabs/presentation/hooks/useProjectManagement.test.tsx`

1. Change single and bulk Custom-project deletion expectations so Domain-mode
   groups remain unchanged.
2. Assert project deletion invokes the application use case exactly once.
3. Run focused node and DOM tests and confirm the old behavior fails.

### Task 3: Implement the domain policy and deletion correction

**Files:**

- Create: `src/contexts/saved-tabs/domain/services/SavedTabsActionSettingsPolicy.ts`
- Modify: `src/contexts/saved-tabs/domain/services/UserSettingsDefaults.ts`
- Modify: `src/lib/storage/settings.ts`
- Modify: `src/lib/storage/projects.ts`
- Modify: `src/contexts/saved-tabs/presentation/hooks/useProjectCrudHandlers.ts`

1. Export a typed, documented five-setting policy from the domain.
2. Compose it into both settings default objects.
3. Remove Custom-project-to-Domain hidden cascade deletion and its swallowed
   error path.
4. Remove the synthetic uncategorized-project delete call.
5. Run focused tests until green.

### Task 4: Record the durable decision

**Files:**

- Create: `docs/adr/0001-saved-tabs-deletion-confirmation-policy.md`

1. Record operation inventory, default intent, confirmation criteria, migration
   effect, and Custom/Domain ownership.
2. Verify documentation agrees with tests and runtime behavior.

### Task 5: Verify and publish

1. Run React Doctor for the hook change.
2. Run focused tests, coverage, the requested quality command, the repository's
   actual quality gate, and the release gate.
3. Run the harness evaluator and resolve findings.
4. Commit, push, and open a non-draft PR against `develop` referencing issue
   #677.
