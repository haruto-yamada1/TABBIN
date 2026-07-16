import { afterEach, vi } from 'vitest'

/**
 * Shared safety net for `isolate: false` (vitest.ci.config.ts).
 *
 * `isolate: false` keeps a single module registry per thread for speed
 * (~18s vs ~36s with `isolate: true`).  That means module singletons, the
 * fake `chrome` global, and Web Storage can leak across test files when a
 * file forgets to clean up after itself.
 *
 * This setup file provides defence-in-depth: after every test we reset the
 * globals that are most prone to cross-file leakage.  Test files are still
 * expected to clean up their own module-level state, but this prevents one
 * file's leftover `globalThis.chrome` or Web Storage from poisoning the
 * next file.
 *
 * Verified safe: `bun run test` and `--sequence.shuffle.files` both stay
 * green with this hook active (see issue #668).
 *
 * Module-level cache reset strategy
 * ---------------------------------
 * Under `isolate: false` a single module registry is shared across every
 * test file in a thread, so module singletons that hold mutable state can
 * leak between files.  The reset strategy (in order of preference):
 *
 * 1. Prefer a dedicated reset helper exported by the owning module — e.g.
 *    `invalidateUrlCache` from `src/lib/storage/urls.ts` — when you only
 *    need to clear the cache without re-evaluating dependents.
 * 2. Use `vi.resetModules()` followed by a fresh dynamic `import()` when a
 *    test needs a fully fresh singleton (fresh `urlRecordsCache`, fresh
 *    WeakMap of React roots, etc.).  This is the pattern already used in
 *    `src/lib/storage/urls.test.ts` (`loadUrlsModule`) and
 *    `src/lib/storage/projects.test.ts` (`loadModule`).
 * 3. Pure, deterministic caches (`Intl.DateTimeFormat` formatters in
 *    `src/utils/localDateTime.ts`, the shiki `highlighterCache` /
 *    `tokensCache` in `src/components/ai-elements/code-block.tsx`) are keyed
 *    by immutable inputs and never need reset.
 */
afterEach(() => {
  // There is no real `chrome` in the test environment.  Resetting to
  // undefined prevents a file that sets `globalThis.chrome` without an
  // afterEach restore from leaking it into the next file under
  // `isolate: false`.  Files that need chrome re-create it in their own
  // beforeEach, which runs before each test body.
  delete (globalThis as { chrome?: unknown }).chrome

  // Clear Web Storage so DOM tests don't inherit leftover keys.
  if (typeof localStorage !== 'undefined') {
    localStorage.clear()
  }

  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.clear()
  }

  // Restore globals stubbed via vi.stubGlobal (e.g. fetch, matchMedia) so a
  // stub from one file does not persist into the next.
  vi.unstubAllGlobals()
})
