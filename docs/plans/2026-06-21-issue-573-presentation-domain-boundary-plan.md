# Issue 573 Presentation Domain Boundary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace every saved-tabs presentation dependency on domain internals with application DTO, mapper, query, use-case, or port contracts.

**Architecture:** Application owns all conversion between domain models and plain presentation DTOs. Presentation receives readonly DTOs, sends primitive commands, and never receives repository interfaces or branded domain values.

**Tech Stack:** TypeScript, React, Vitest, dependency-cruiser, Oxlint, oxfmt

---

### Task 1: Restore the real failing dependency graph

**Files:**

- Delete: `src/contexts/saved-tabs/application/SavedTabsPresentationBoundary.ts`
- Restore: `src/contexts/saved-tabs/presentation/**/*.{ts,tsx}`
- Keep: `.dependency-cruiser.cjs`
- Keep: `src/lib/architecture/dependencyCruiserConfig.test.ts`

1. Remove the facade and import-only rewrites.
2. Run the architecture test and `bun run arch:check`.
3. Record production and test violation counts as the RED baseline.

### Task 2: Add application presentation DTOs and mappers

**Files:**

- Create: `src/contexts/saved-tabs/application/dto/SavedTabsPresentationDto.ts`
- Create: `src/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper.ts`
- Test: `src/contexts/saved-tabs/application/mappers/SavedTabsPresentationMapper.test.ts`

1. Define explicit primitive DTOs for settings, tab groups, parent categories,
   custom projects, URL records, and snapshots.
2. Add failing mapper tests for copying branded values into plain DTOs.
3. Implement domain-to-DTO mapping without casts or re-exports.

### Task 3: Convert application read contracts

**Files:**

- Modify: `src/contexts/saved-tabs/application/queries/*.ts`
- Modify: `src/contexts/saved-tabs/application/createSavedTabsUseCases.ts`
- Test: related query and facade tests

1. Change presentation-consumed query results from domain entities to DTOs.
2. Add queries for repository reads still performed by presentation.
3. Expose queries through the application use-case facade.

### Task 4: Convert application command contracts to primitives

**Files:**

- Modify: presentation-consumed files under `application/commands/` and
  `application/use-cases/`
- Test: related use-case tests

1. Accept plain strings/numbers at application boundaries.
2. Convert and validate branded values inside application implementations.
3. Keep domain service and repository contracts branded internally.

### Task 5: Move domain service usage behind application services

**Files:**

- Create or modify: `src/contexts/saved-tabs/application/services/`
- Modify: `src/contexts/saved-tabs/presentation/app/SavedTabsApp.tsx`
- Modify: category and reorder hooks

1. Wrap categorization and category reorder operations in application services.
2. Return application DTOs only.
3. Remove presentation imports of domain services and constants.

### Task 6: Remove repositories from presentation

**Files:**

- Modify: presentation pages, controllers, contexts, handlers, and containers
- Modify: `src/contexts/saved-tabs/application/createSavedTabsUseCases.ts`

1. Replace repository reads with application queries.
2. Replace repository writes with application use cases.
3. Replace `SavedTabsUseCasesDeps` exposure with a presentation-safe contract
   containing use cases, queries, and non-repository ports only.

### Task 7: Migrate presentation tests

**Files:**

- Create: `src/contexts/saved-tabs/application/testing/SavedTabsPresentationFixtures.ts`
- Modify: presentation `*.test.ts` and `*.test.tsx`

1. Build test data from application DTO fixtures.
2. Mock queries, use cases, and ports rather than domain repositories.
3. Remove all presentation test imports from `domain/`.

### Task 8: Final verification

1. Run targeted mapper/query/use-case tests during each RED/GREEN cycle.
2. Run `bun run arch:check` and confirm zero direct edges.
3. Run `bun run check`, `bun run compile`, and `bun run test`.
4. Run `bun run test:coverage` and inspect `coverage-final.json`.
5. Run React Doctor and harness validate/audit.
