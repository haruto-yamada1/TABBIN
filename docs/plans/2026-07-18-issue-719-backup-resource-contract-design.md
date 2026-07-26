# Issue #719 Backup Resource Contract Design

## Context

The current import UI rejects JSON files larger than 10 MiB before reading them.
That number is local to `ImportFileDialog` and is not related to the logical data
that production can persist or export. Persistence Model v2 includes logical
URLs, collections, memberships, settings, AI history, attachments, analytics
views, chart data, and JSON-safe tool traces. A supported export can therefore
exceed 10 MiB while remaining valid.

Backup V2 itself belongs to #730. This issue must define the executable resource
contract that both the #730 exporter and importer consume without prematurely
defining the Backup V2 schema.

## Decision

Create one schema-independent policy in
`src/lib/persistence/backupResourcePolicy.ts`. Callers provide safe numeric
usage metrics; the policy returns either success or a typed violation. The same
validator is used before export and after import preflight, so policy values
cannot drift between the two directions.

A supported production state is a logical snapshot that:

1. satisfies Persistence Model v2 invariants;
2. contains only data included by the Storage Placement Matrix;
3. satisfies every per-resource and nested limit below; and
4. serializes to no more than 128 MiB of UTF-8 JSON.

Reaching every individual maximum simultaneously is not required. The total
serialized-byte limit is an additional constraint that bounds combinations of
otherwise-valid resource maxima.

## Supported envelope

| Resource                                     | Maximum |
| -------------------------------------------- | ------: |
| Serialized Backup V2 JSON                    | 128 MiB |
| URLs                                         | 100,000 |
| Collections                                  |  10,000 |
| Memberships                                  | 500,000 |
| Categories                                   | 100,000 |
| Groups                                       |  10,000 |
| AI conversations                             |   1,000 |
| AI messages, total                           | 100,000 |
| AI messages per conversation                 |  10,000 |
| Attachments, total                           | 100,000 |
| Attachments per message                      |       5 |
| Decoded bytes per attachment                 |   2 MiB |
| Decoded attachment bytes, aggregate          |  32 MiB |
| Saved analytics views                        |  10,000 |
| Chart data points, total                     | 500,000 |
| Chart data points per chart                  |  50,000 |
| Tool traces, total                           | 100,000 |
| Serialized bytes per tool trace input/output |   1 MiB |
| Serialized tool trace bytes, aggregate       |   8 MiB |
| Keywords per owning entity                   |   1,000 |
| UTF-8 bytes per keyword                      |   1 KiB |
| UTF-8 bytes per URL                          |   8 KiB |
| UTF-8 bytes per user name                    |   4 KiB |
| UTF-8 bytes per title                        |  64 KiB |
| UTF-8 bytes per notes field                  |   1 MiB |
| UTF-8 bytes per AI message content field     |   4 MiB |

The attachment count and per-file byte limits share the production AI upload
constants. They are not copied as separate backup-only magic numbers.

## Numeric basis

The parent #724 benchmark range includes 100,000 URLs and membership fan-out up
to ten. A local Node v24.18 synthetic snapshot with 100,000 representative URLs,
10,000 collections, and 500,000 memberships produced:

| Measurement           |    Result |
| --------------------- | --------: |
| Compact UTF-8 JSON    | 90.49 MiB |
| Build                 |   46.9 ms |
| `JSON.stringify`      |  103.0 ms |
| `JSON.parse`          |  222.8 ms |
| RSS before generation |  31.9 MiB |
| RSS after stringify   | 596.4 MiB |
| RSS after parse       | 718.3 MiB |

The production download path uses compact JSON, so the measured representation
and the enforced Blob size are the same. #730 must preserve that compact
serialization boundary; whitespace-formatted JSON is not part of the supported
export contract. The 128 MiB ceiling is the next bounded envelope above this
representative core snapshot. It leaves about 37 MiB for settings and optional
payloads while the 32 MiB attachment aggregate and 8 MiB tool-trace aggregate
prevent one nested payload class from consuming the envelope without an explicit
failure. The high observed peak memory is also why this change does not raise the
cap to 256 MiB or introduce compression/streaming without the #730 mapper and
validation benchmarks.

## Validation and errors

The policy validates metrics in deterministic order and exposes only the
resource name, observed numeric value, and limit. It never carries URLs, notes,
prompts, attachment contents, or tool input/output in diagnostics.

- `BACKUP_FILE_TOO_LARGE`: serialized UTF-8 bytes exceed the total ceiling.
- `BACKUP_RESOURCE_LIMIT_EXCEEDED`: a collection or aggregate count exceeds its
  supported maximum.
- `BACKUP_NESTED_PAYLOAD_TOO_LARGE`: a per-owner or nested byte/count limit is
  exceeded.
- `INVALID_BACKUP`: a metric is not a finite non-negative safe integer.

The current legacy importer adopts the same serialized-byte preflight instead
of the local 10 MiB constant. Current legacy shape validation remains owned by
the compatibility importer; Backup V2 resource metrics are collected by #730's
mapper and are not inferred from legacy mixed representations.

## Recovery capacity

#740 may retain at most two recovery snapshots for seven days. Capacity
preflight uses actual serialized bytes and reserves space for both snapshots;
it does not assume every snapshot is 128 MiB. The policy ceiling therefore
bounds the worst-case retained payload at 256 MiB before IndexedDB overhead and
the #735 reserve are applied. Snapshot creation failure continues to block an
overwrite import.

## Rejected alternatives

- Keep 10 MiB: fails the representative supported core snapshot.
- Raise only the UI cap: leaves export/import and nested resources inconsistent.
- Exclude AI data silently: contradicts the Storage Placement Matrix and #730.
- Add compression or streaming now: the 128 MiB benchmark does not establish a
  schema-specific need, and those mechanisms belong with #730 serialization.
- Validate raw Backup V2 fields here: would pre-empt #730's public schema.

## Verification

- Exact-limit and one-over unit tests for every resource class.
- Typed error tests for file, resource, nested, and invalid-metric failures.
- Safe-diagnostic test that serializes a violation and finds no user content.
- UI regression proving 10 MiB is no longer the cap and the shared cap still
  rejects before `FileReader`.
- Architecture test protecting the envelope, round-trip contract, error codes,
  benchmark evidence, and #740 retention/capacity handoff.
