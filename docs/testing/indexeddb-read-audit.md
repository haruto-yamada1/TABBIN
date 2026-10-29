# Saved Tabs IndexedDB read audit (#901)

## Baseline and related work

Audited `develop` at `0b5a9df0c38bbae0c810ba77caa965835b168ac1` on
2026-10-18. The live issue had no comments or additional constraints.

- #726 introduced the schema, verified snapshot/query adapter and synthetic
  benchmark. That benchmark exercises `IndexedDbSavedTabsQueryAdapter`, which
  already indexes its projection; it does not exercise the session-backed
  Saved Tabs page repositories audited here.
- #861 removed legacy domain storage. IndexedDB remains authoritative; settings
  remain in Chrome Storage. No legacy read or dual write is reintroduced.
- #902 and #885 cover invalidation, stale writes, atomic rollback and restarts.
  Their verified rereads and revision CAS remain intact.

## Read paths and findings

| Action                    | Current path                                                                           | Decision                                                                                          |
| ------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Initial domain list       | `useTabData` → `getSavedTabsPageData` → session → verified snapshot → native read port | Group memberships/categories once per read and share the URL map.                                 |
| Domain text search        | `organizeTabGroupsWithCategories` filters the loaded presentation data                 | No additional IndexedDB read; preserve matching and category behavior.                            |
| Category collapse         | `useCategoryGroupState` changes local state                                            | No database query or new index needed.                                                            |
| Switch to custom projects | `useProjectCrudHandlers` loads custom project raws through a new session               | Keep the fresh read; use the same per-call relation grouping.                                     |
| Custom project URL search | `filterCustomProjectsByQuery` → `getProjectUrls` → URL repository                      | Read URL records once and join by ID, instead of rebuilding all URL entities for each membership. |
| Refresh / invalidation    | A new public query obtains a new verified snapshot                                     | Do not cache snapshots or joins across operations.                                                |

For D domains, U URLs, M memberships and C categories, the old domain list
performed O(D × (U + M + C)) join work, in addition to required decoding,
integrity validation and sorting. The new joins visit each source record a
bounded number of times, with per-collection stable sorting unchanged. Custom
URL resolution replaces O(project memberships × U) URL entity materialization
with one O(U) read and a map lookup for each membership.

`NativeSavedTabsReadProjection.test.ts` counts source-record property reads,
without a wall-clock threshold. Before the fix, 50 domains / 1,000 memberships /
50 categories caused 2,550 category ownership reads (linear budget: 150).
`GetProjectUrlsUseCase.test.ts` also demonstrates the old 100 per-ID repository
reads for 100 memberships, replaced by one read. Output assertions retain
ordering, empty categories, notes, timestamps and current-session changes.

## Object store indexes and integrity boundary

The existing v1 schema already has membership `collectionId`, `urlId`,
`collectionAndCategory`, `collectionOrder`; category `collectionId`,
`collectionOrder`; collection `groupId`, `groupOrder`, `definitionType` and
`canonicalDomain` indexes. Adding an index does not remove the measured
in-memory joins, and domain text search is fuzzy search over loaded data.
No index or schema upgrade is needed for these changes.

Normal reads deliberately retain the five saved-tabs stores plus revision in
one readonly transaction, decoder validation and the global integrity check.
Independent indexed reads cannot silently replace this boundary: they could
mix revisions or hide corruption outside a selected collection. Backup and
recovery readers retain their own consistent full-store boundary. AI history,
messages, analytics and recovery payloads are not read by the saved-tabs-only
snapshot reader.

The initial UI still performs separate repair and URL-resolution operations
after the page query, and searching multiple custom projects still opens one
session per project. This audit does not merge those operation boundaries or
introduce a retained snapshot cache; either change needs separate concurrency
and invalidation design. No claim is made that every full snapshot is removed.

## Native browser comparison

Measurements use synthetic data only, the production page/project queries,
native IndexedDB in Playwright Chromium and Firefox, and a dedicated browser
process tree. Results contain counts, latency and aggregate RSS, never saved
URLs, titles or notes. RSS is process-tree resident memory rather than JS heap;
GC, browser allocation and operating-system noise affect it. Measurements are
observations, not absolute pass/fail performance thresholds.

The browser regression also checks ordering, category/notes resolution,
read-only revision stability, fresh mutations, close/reopen and integrity.

Measurements on 2026-10-18 used Bun 1.3.14, Playwright 1.63.0, Chromium
153.0.8010.12 and Firefox 155.0 on macOS arm64. The before runner was Node
22.14.0; the after runner was Node 24.17.0. Only orchestration runs in Node:
the timed production queries run inside the same native browser engines with
Bun-built bundles. The final after run did not overlap test/build gates.

Both sizes use 200 domain collections, 20 parent groups, 402 categories
(including empty ones), one custom collection with 100 memberships, and
U + 100 total memberships. Values below are medians of three sequential calls,
including verified snapshot read, integrity check, session clone/diff and
projection. They do not measure first paint or complete UI startup.

| Browser  |   URLs | Page query before → after | Project query before → after | Sampled RSS peak before → after |
| -------- | -----: | ------------------------: | ---------------------------: | ------------------------------: |
| chromium |  1,000 |            19.0 → 14.2 ms |               42.5 → 13.1 ms |               437.1 → 347.5 MiB |
| chromium | 10,000 |           157.0 → 94.9 ms |              364.4 → 90.5 ms |               768.8 → 575.2 MiB |
| firefox  |  1,000 |            28.0 → 12.0 ms |               93.0 → 13.0 ms |             1287.6 → 1090.3 MiB |
| firefox  | 10,000 |          308.0 → 104.0 ms |             925.0 → 105.0 ms |             1832.1 → 1273.0 MiB |

At 10k URLs the initial page query decreased by 39.6% in Chromium and 66.2%
in Firefox; the project query decreased by 75.2% and 88.6%. After closing the
connection and reloading, 10k page medians were 156.5 → 92.5 ms (Chromium) and
306 → 103 ms (Firefox), and project medians were 424.4 → 89.8 ms and
943 → 103 ms.

RSS is sampled every 50 ms for the entire scenario, including synthetic fixture
expectations, six timed reads and search verification; it is not an isolated
query heap or a guaranteed peak. At 10k, pre-scenario RSS was 397.3 → 396.2 MiB
in Chromium and 1071.8 → 1070.5 MiB in Firefox. The sampled peak reduction is
consistent with removing repeated Maps/entity materialization, but these
machine-specific observations do not establish a general memory bound.

The `saved-tabs-read-measurement` Playwright JSON attachment retains each
sample, counts, initial/reloaded measurements, and runner/browser metadata.
Use a JSON reporter to retain inline attachments, for example:

```sh
PLAYWRIGHT_JSON_OUTPUT_FILE=/tmp/saved-tabs-read.json bun run test:indexeddb:browsers -- saved-tabs-read.spec.ts --reporter=json
```

The original before/after reports for this audit were
`/tmp/tabbin-issue-901-read-baseline.json` and
`/tmp/tabbin-issue-901-read-after.json`. A contended intermediate measurement
was discarded from this comparison. Both baseline and final browser runs
passed all four scenarios. `NativeSavedTabsReadProjection.test.ts` supplies
the deterministic regression limit independently of these timing observations.

```sh
bun run test:node -- src/contexts/saved-tabs/infrastructure/composition src/contexts/saved-tabs/application/use-cases/GetProjectUrlsUseCase.test.ts
bun run test:indexeddb:browsers -- saved-tabs-read.spec.ts
bun run test:indexeddb:browsers -- concurrent-persistence.spec.ts cross-context-invalidation.spec.ts corrupt-persistence.spec.ts
```
