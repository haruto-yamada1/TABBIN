# Large Saved Tabs lists (#1140)

Cards in a newly opened Domain or Custom list start collapsed at 300 saved URL
rows in that mode. Custom counts memberships because the same URL may appear in
multiple projects. Below 300 rows, cards start expanded. A card keeps its browse
state while mounted, including when a save or deletion crosses the threshold.
In a large list, matching cards open on search with their own disclosure state.
Clearing the search restores the browsing defaults or the user's choice for
cards still mounted. In Domain mode, URL and title search also work with
parent categories hidden.

The 300-row threshold leaves the 120-row audit case expanded. The first view of
the 1,000-row fixture draws card headers, counts and actions, and users can
expand any card. The existing document layout and keyboard navigation support
expanded cards and search results.

## Reproduction

Use the pinned toolchain, frozen dependencies and Playwright Chromium. Run
these commands sequentially with other builds and test runners idle.

```sh
bun install --frozen-lockfile
bunx playwright test --config playwright.rendering.config.ts --grep '1000 synthetic' --repeat-each=3
bun run e2e e2e/search-performance.extension.spec.ts --project=extension --workers=1 --reporter=line
bun run e2e e2e/saved-tabs-rendering.extension.spec.ts e2e/saved-tabs-scroll.extension.spec.ts --project=extension --workers=1 --reporter=line
```

The rendering probe uses the production profiling renderer. Each sample loads
1,000 synthetic URLs in 20 domains and five custom projects from IndexedDB.
Initial timing runs from navigation to the expected card and URL sets, settled
page-local reads and operations, and two animation frames without another
commit. The scroll probe goes down and back in 25 fractional steps, waiting
two frames at each position and recording actual travel. It measures the
collapsed list and measures again after expanding every card. The test checks
that all URL links reappear and IndexedDB retains all URLs and memberships.

The search probe uses the ordinary extension build. After warming the search
index, it times 12 trusted input changes alternating between distinct one-row
result sets. It also times one URL query that matches all 120 or 1,000 rows. The probe
requires the exact URL set and uses two animation frames after DOM completion
as the result paint opportunity. Search and rendering JSON are attached to the
respective Playwright tests.

## Local reference targets

| 1,000-row measurement                                    |  Reference target |
| -------------------------------------------------------- | ----------------: |
| Initial card display, including navigation and bootstrap | ≤ 1,500 ms median |
| Worst scroll step, including two animation frames        |          ≤ 100 ms |
| Warm one-result query to result paint opportunity        |      ≤ 200 ms p95 |
| Query matching all rows to result paint opportunity      |          ≤ 600 ms |

These are local reference targets on desktop Chromium. They help compare
repeat runs on the same machine. Browser frame scheduling and the synthetic
distribution limit what the numbers say about other devices or real input.
The E2E assertions cover card and URL sets and actual scrolling. Timing values
are recorded as observations.

## Results

Measured on 2026-11-26 with macOS 27.2 arm64, Node 24.22.1, Bun 1.3.14,
Playwright 1.64.1 and Chromium 156.0.8078.4. The baseline application was
`d965600c`. One baseline Domain sample timed out during extension worker
startup, before any measurement. The successful samples numbered two for
baseline Domain and three each for baseline Custom and both updated modes.

| Mode   | Initial display, median | URL rows at first display | Document elements at first display | Fully expanded scroll sweep, median |
| ------ | ----------------------: | ------------------------: | ---------------------------------: | ----------------------------------: |
| Domain |          1,042 → 635 ms |                 1,000 → 0 |                     22,188 → 1,088 |                        848 → 840 ms |
| Custom |          1,281 → 910 ms |                 1,000 → 0 |                       20,397 → 387 |                        847 → 846 ms |

The updated Domain list traveled 632 px when collapsed. The longest step in
any collapsed Domain sample was 34.4 ms. All five collapsed Custom cards fit
in the 1,280 × 720 viewport. When expanded, the Domain and Custom lists
traveled about 35,420 and 41,022 px respectively, with a maximum 34.3 ms step
in either mode. The scroll sweep includes 50 animation frames and a settling
check, so the step timings describe responsiveness more directly than the
sweep total.

### Search response

The final Chromium run on 2026-11-27 used the same toolchain. Times run from
trusted input to the first paint opportunity after the exact result set.

| Mode   | Saved URLs | One result, p50 | One result, p95 | All results, single sample |
| ------ | ---------: | --------------: | --------------: | -------------------------: |
| Domain |        120 |         43.8 ms |         65.6 ms |                    63.2 ms |
| Domain |      1,000 |         54.8 ms |         64.8 ms |                   214.0 ms |
| Domain |     10,000 |         44.4 ms |         51.9 ms |                          — |
| Custom |        120 |         89.9 ms |         98.4 ms |                   123.0 ms |
| Custom |      1,000 |        124.0 ms |        132.9 ms |                   286.3 ms |
| Custom |     10,000 |        218.2 ms |        244.4 ms |                          — |

The baseline warm 1,000-row p95 was 32.4 ms in Domain and 102.1 ms in Custom.
The p95 to DOM completion was 8.9 → 10.2 ms in Domain and 83.0 → 75.5 ms in
Custom. Animation-frame intervals varied between runs. At 1,000 rows, the
updated one-result and all-result scenarios met the local reference targets.
The 10,000-row cases stress the existing search path and have no target in
this change.

## Keyboard and accessibility coverage

The disclosure button names its domain or project and exposes its expanded
state. Chromium tests use Tab navigation to reach the disclosure button and
its first revealed link. They exercise Enter and Space and check that the
button keeps focus on activation. Axe covers the initial view in both modes.
The same tests check that search reveals a matching URL and that clearing
search returns to the collapsed view. Tests at 299 and 300 rows exercise the
threshold, and the 120-row search scenarios verify that the links start visible.

The [native Firefox search recipe](search-performance.md#reproduce-the-native-macos-firefox-path)
also passed in Domain and Custom at 1,000 and 10,000 rows. It checks trusted
input, exact results and the return to the collapsed list when clearing search.

[Domain screenshot](../assets/issue-1140-domain-collapsed.png) ·
[Custom screenshot](../assets/issue-1140-custom-collapsed.png)
