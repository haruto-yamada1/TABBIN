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
