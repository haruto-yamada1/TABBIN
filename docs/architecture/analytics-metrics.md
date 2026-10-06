# Analytics metric semantics

Analytics reads a dedicated event projection from one verified Persistence v2
snapshot. It does not reuse the AI saved-URL projection and does not infer a
Domain or Custom event from the URL's current collection arrays.

## Metric contract

| Metric               | Source timestamp     | Counted identity                 |
| -------------------- | -------------------- | -------------------------------- |
| First saved URLs     | `Url.firstSavedAt`   | one event per URL                |
| Last saved activity  | `Url.lastSavedAt`    | one event per URL                |
| Collection additions | `Membership.addedAt` | one event per URL and collection |

Domain and Custom series are collection-addition events joined with
`Collection.definition.type`. Collection, category, and group labels come from
that same Membership and Collection join. Re-saving a URL updates only the
last-saved event. Adding the same URL to another collection creates a separate
collection-addition event without changing either URL timestamp.

## Historical timestamp quality

Each historical timestamp carries one of these provenance values:

- `exact`: a new Persistence v2 write, a canonical legacy last-save timestamp,
  or a membership-specific nested legacy timestamp.
- `legacy-fallback`: a URL first-save value reconstructed from legacy data, a
  collection-level timestamp used for Membership, or a record written before
  provenance markers existed.

Migration time is never substituted for historical time. Reports persist only
aggregate exact/fallback counts; they do not expose URLs, titles, collection
names, or timestamps. Analytics displays a limitation notice only when the
selected metric contains fallback records.

## Query migration

Analytics query schema version 2 adds `metric` and `collectionType`. One
normalizer is used for built-in presets, saved views, route state, and AI tool
results. Legacy queries map as follows:

| Legacy concept                       | Version 2 meaning                                   |
| ------------------------------------ | --------------------------------------------------- |
| `mode: domain`                       | Membership additions filtered to Domain collections |
| `mode: custom`                       | Membership additions filtered to Custom collections |
| `parentCategory`                     | collection group                                    |
| `project`                            | Custom collection                                   |
| `projectCategory`                    | Custom collection category                          |
| `subCategory`                        | Domain collection category                          |
| time/domain with no mode restriction | first-saved URL metric                              |

Invalid persisted queries are rejected instead of being shallow-cast. IDs,
names, and created/updated timestamps of valid saved views are preserved.

## Saved-tab health overview

The overview uses the already-loaded, savable-URL-filtered event projection,
independently of chart queries. A memoized pass aggregates event rows by URL ID
and unions membership category labels. URL save events have empty category
arrays and must not make classified URLs appear uncategorized. No extra
snapshot read, browser history permission, or persisted health state is needed.

The score is an organizing heuristic, rounded to an integer:

`100 - 40 * uncategorizedRate - 40 * duplicateRate - 20 * max(0, 2 * largestCategoryLabelShare - 1)`

- Uncategorized means no Domain or Custom category on any current membership.
  A collection group alone does not count as a category.
- Duplicates are extra distinct URL IDs with identical URL strings. Multiple
  events and memberships for the same ID count once. Canonical persistence
  already rejects normalized URL duplicates, so healthy snapshots report zero.
- Category-label share uses categorized URLs as the denominator and counts each
  URL once per label and mode. Identical labels within a mode are combined;
  this is a label distribution, not a category identity or quality judgment.
- Empty data has no score. All formulas and limitations are shown in English
  and Japanese. Chart filters do not change the library-wide assessment.

Viewing history is not tracked and is excluded from scoring. Review candidates
instead include URLs whose **exact last-save** timestamp is at least 90 days
old. First-save and membership timestamps, unknown dates, and fallback dates
cannot establish this condition. These candidates are not claimed to be
unviewed or unnecessary. Recent category additions show current category
labels of URLs first saved within seven days using exact timestamps, excluding
re-saves and future dates.

Suggestions open the existing drilldown, using distinct URL IDs and existing
open/delete/confirmation/Undo behavior. After delete or Undo, both the score and
selected candidate list are rebuilt from refreshed records. The chart stays
in normal flow while health candidates are selected so its sticky
position cannot obscure the candidate toolbar after navigation. Other charts
retain their sticky behavior. Organization links
use the existing Saved Tabs route; there are no dedicated Cleanup or Inbox
routes in the current app.
