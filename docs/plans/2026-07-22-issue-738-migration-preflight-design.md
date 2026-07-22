# Issue #738 migration preflight design

Status: implementation plan for the read-only preflight release
Parent: Issue #724
Depends on: Issues #711, #712, #725, #727, #735, and #736

## Decision

Use rollout Option A. The preflight ships before the migration and cutover
release. It is a per-user fail-early gate with local diagnostics, not a
telemetry or production-data-learning release. A healthy result proves only
that the observed source snapshot passed the current checks; it does not mark
migration complete or authorize source-of-truth cutover by itself.

Actual IndexedDB migration remains Issue #728. Source-of-truth cutover and
legacy cleanup remain Issue #729.

## Authority and coordination

The preflight has a control-plane record separate from
`tabbin:persistenceControlState:v2`. It stores the typed status, safe counts,
capacity outcome, report version, and the approved source fingerprint. The raw
fingerprint is internal and is never copied into user diagnostics.

The preflight reuses the Issue #727 `PersistenceCoordinationPort`:

```text
exclusive barrier
  -> one raw chrome.storage.local read of the migration source keys
  -> fingerprint that exact snapshot
release barrier
  -> pure source checks and dry mapping
  -> Persistence v2 integrity check
  -> capacity preflight
exclusive barrier
  -> re-read and fingerprint the current source
  -> save healthy / blocked only when the fingerprint is unchanged
  -> otherwise save stale
```

Normal legacy writers already use the shared side of this stable cross-context
barrier. The raw reader must use the underlying storage port directly while the
exclusive barrier is held; acquiring the gated shared port recursively could
deadlock.

## Raw source boundary

The reader has only `get` capability and reads the selected source keys in one
call. Every key remains explicitly `missing` or `present`; a present empty array
is not collapsed into a missing key. Storage rejection and partial/non-object
results are typed read errors. Schema validation belongs to the pure analyzer,
which reports invalid values without dropping or repairing records.

The migration source key set follows the reviewed storage placement matrix:
saved URLs, domain/custom collections and relation metadata, AI conversations
and selection, and saved analytics views. Settings and unrelated UI/control
keys are not part of the migration fingerprint.

## Analysis and privacy

The pure analyzer uses `exact-url-v1`, reports source-only relation and identity
conflicts before invoking the Issue #712 target checker, and never silently
merges or drops a record. Missing timestamp provenance is reported; current
time is not substituted for historical data.

The copied diagnostic contains only fixed issue codes, entity counts, collision
count, capacity status, and version identifiers. It excludes
URLs, titles, notes, keywords, prompts, conversation/attachment content, raw
errors, and raw fingerprints. No external telemetry is added.

## Recovery UX

`blocked` states state that preflight did not change current data, while `stale`
states report that the source changed after preflight. Both offer:

- copy safe diagnostic;
- download the raw current-data snapshot without forgiving getters or implicit
  migration;
- retry the preflight.

The emergency raw backup is a recovery artifact, not Backup V2 and not evidence
that the data is migration-ready.

## Verification

Tests cover missing versus present-empty source values, read failure, invalid
types, source conflicts, URL identity collisions, capacity blocking, healthy
reports, writer exclusion, source change during analysis, stale cutover gating,
diagnostic privacy, copy/backup/retry actions, and the absence of telemetry.
