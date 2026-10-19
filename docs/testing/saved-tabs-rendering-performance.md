# Saved Tabs rendering observations (#921)

## Scope and reproduction

The baseline is `develop` at `69c91edff3cce32f9489039a37f989b3e47da006`.
#284 is closed. #900 / PR #969 measures search input and explicitly excludes
startup, broad-result rendering and heap retention. #909 remains a separate
performance-budget issue. This benchmark adds initial list rendering, scrolling
and collapse/expand observations without adding an absolute CI time budget.

Both batches use the same benchmark files, dependencies and fixture. For the
before batch, only `useDomainCardState.ts` is replaced with its content from the
baseline commit; the optimized bytes are saved and restored in `finally` before
the after batch. The results record both source hashes. Preserve the before JSON
attachments before running the after batch, which replaces the test output.

Use the pinned Node 24 and Bun versions, frozen dependencies, and installed
Playwright Chromium. Run before and after sequentially, with no concurrent
builds or tests:

```sh
bun install --frozen-lockfile
bunx playwright test --config playwright.rendering.config.ts --repeat-each=3
```

The dedicated WXT configuration inherits the production configuration, switches
to React's production profiling renderer, and inserts root and named subtree
`Profiler` boundaries at build time. Its output stays in `.output/rendering/`.
The normal build and release source contain no runtime measurement hook.
The dedicated Playwright configuration runs only the benchmark suite; ordinary
extension E2E selection does not include it.

Each fresh browser profile receives 1,000 or 10,000 unique synthetic URLs, 20
domain collections, five custom projects and twice as many memberships as URLs.
Collections include their saved Uncategorized position, so first-use order
initialization does not start unrelated auto-save writes during the measurement.
All addresses use reserved `.example` domains. Native IndexedDB and the existing
extension fixture, including its outbound-request checks, remain in use.

## What is measured

- Initial full-document navigation through bootstrap, hydration and the exact
  expected URL set in the DOM.
- Thirteen fractional scroll positions down the saved-tabs pane and twelve back.
- A sweep of every card's real collapse button handler, followed by every expand
  handler. The UI has individual card controls; this is a sequence of actions.
- Root commit counts and named subtree `Profiler` callbacks / `actualDuration`.
- Page-local readonly IndexedDB transactions, session/query calls, document DOM
  elements, Chromium heap usage and CDP DOM counters at each completed operation.

Completion requires the exact URL set, zero active page-local reads and
instrumented session/query operations, and two animation frames with no new
operation, read or React commit. The build-only operation probe wraps the full
async bodies in `try/finally`, including settings reads and queued commit work
after a native readonly transaction has completed. Each sample verifies equal
started/completed counts and zero pending operations. After the sweeps, native
storage is read again to verify the URL set and membership count are preserved.
The JSON attached to each test retains individual operation and per-card values.

These are observations of the instrumented production profiling build, not
timings of the ordinary release renderer. Nested profiler durations overlap and
must not be summed. Programmatic button clicks and fractional scrolling are
repeatable workload probes, not physical input or a complete INP measurement.
Two animation frames mark a paint opportunity, not physical presentation.
Heap values are unforced-GC observations and do not establish a leak or retained
memory bound; CDP node counts can include detached nodes. Transaction counts
exclude background-worker reads. Three runs per size/mode describe local
variability; they cannot establish population percentiles or a general device
budget. Earlier exploratory runs that did not track full async operations are
excluded from the reported comparison.

## Investigation

`DomainCardRoot` supplies `getSavedTabsPageData` to each card's state hook.
On mount, `useDomainCardState` fetched the whole saved-tabs projection only to
extract parent categories. The IndexedDB session verifies and clones the full
snapshot for each query, so this repeats work with every domain card.

The card's parent-category state is consumed only by the management modal.
`useCategoryKeywordModal` already reads them when opened, handles read errors,
subscribes to parent-category changes and sends the result back through
`onUpdateParentCategories`. The optimization removes the duplicate
closed-modal read while preserving this existing authoritative refresh path.

Existing card memo boundaries and `content-visibility: auto` are retained.
Custom project URL reads, scroll-control geometry queries and full URL-row
mounting remain distinct potential costs. Their existence alone is insufficient
reason for changing their freshness, drag-and-drop or rendering contracts.

## Recorded comparison

[Results and all 24 samples](saved-tabs-rendering-performance-results.json)
include source hashes, operation counts, nested profiler measurements, per-step
durations and heap/DOM observations. Measurements on 2026-10-19 used macOS arm64,
Node 24.17.0, Bun 1.3.14, Playwright 1.63.0 and Chromium 153.0.8010.12. Before and
after batches ran sequentially without concurrent build/test gates. Each cell
below is the median of three fresh-profile observations, in milliseconds.

| Mode   |   URLs | Initial before → after | Scroll before → after | Collapse before → after | Expand before → after |
| ------ | -----: | ---------------------: | --------------------: | ----------------------: | --------------------: |
| Domain |  1,000 |        2739.9 → 1873.9 |         850.6 → 837.1 |           678.5 → 691.0 |         680.7 → 681.6 |
| Domain | 10,000 |       12016.2 → 8189.3 |       1106.8 → 1283.5 |           713.4 → 720.3 |       2860.0 → 2838.0 |
| Custom |  1,000 |        3073.8 → 2526.5 |         847.5 → 850.2 |           170.7 → 172.4 |         326.9 → 326.5 |
| Custom | 10,000 |      30348.6 → 17337.5 |       1224.0 → 1191.9 |         2433.6 → 2257.2 |       6660.0 → 4101.4 |

The deterministic change is twenty fewer closed-modal queries: every Domain
sample goes from 22 page queries / 32 session operations / 32 readonly native
transactions to 2 / 12 / 12, with all operations completed. The two remaining
queries belong to existing page loading. Custom remains at 2 / 37 / 37 in every
sample. This does not establish a Custom query-work improvement. Timings also
include application bootstrap, scheduling, memory pressure and profiling overhead; the
Custom timing change despite unchanged work counts illustrates these limits.
No scroll, collapse, general-device or ordinary-release-renderer speedup is
claimed from these samples.

The profiler identifies expanded URL lists as substantial remaining React work.
For 10,000 URLs, median initial `actualDuration` across the 20
`DomainCardContent` boundaries is 3949 ms before and 4000 ms after, while root
render work is 4068 / 4143 ms. The five Custom
`ProjectCardUncategorizedArea` boundaries account for 6130 / 5746 ms, with root
render work 7489 / 7513 ms. These inclusive subtree totals overlap their parent
measurements. The read removal does not remove URL-row rendering. Root initial
commit counts are 21 before and 20–21 after for Domain, and 24 / 25 for Custom;
fewer query calls are not equivalent to fewer React commits.

Unforced initial heap observations for 10,000 URLs range from 610–612 MiB before
to 796–1554 MiB after in Domain, and 1605–1681 MiB before to 720–1745 MiB after
in Custom. These variable values are recorded without a memory-reduction or
leak claim. DOM/heap observations after scroll, collapse and expansion remain in
the JSON. Further URL-row or Custom-read optimization would require its own
freshness and drag-and-drop regression evidence; it is not bundled into this
change.

## Regression and compatibility evidence

The new hook regression fails on the baseline because mounting an otherwise
idle card calls the page query once. After the change, mount and collapse/expand
call it zero times. Existing sort, deletion and order-persistence tests remain
in place. Modal tests cover latest-category refresh on reopening, synchronization
back to the card, storage changes and read errors.

The benchmark asserts exact DOM URL sets, zero visible URL rows when all cards
are collapsed, full restoration when expanded, and unchanged native URL and
membership counts. The ordinary Chromium build separately exercises modal
reopening, collapse/expand and native URL preservation with 1,000 URLs, alongside
the existing scroll E2E. Native Firefox 155 IndexedDB restart/rollback and URL
opening smoke checks also pass. Profiling and heap timing are Chromium-only;
Firefox smoke is functional compatibility evidence, not a Firefox performance
measurement. Permissions, storage schemas and production build settings are
unchanged.

The completed full Chromium extension suite reports 56 passed and two Ollama
connection failures (the model-list assertion for `127.0.0.1` and `localhost`).
Both failures also reproduce with all production code restored to the baseline;
they are not counted as passes. The new card test, existing scroll test and all
four search scenarios pass. Reproduce the baseline failure subset with:

```sh
bun run e2e --project=extension --workers=1 --grep 'を保存・再読み込みし、モデル一覧とチャットに反映する' --reporter=line
```
