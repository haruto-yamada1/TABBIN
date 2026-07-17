# Issue #735 persistence durability design

## Scope

Issue #735 is a Phase 0 durability contract for Persistence Model v2. It does
not implement the IndexedDB schema, connection lifecycle, migration mapper, or
source-of-truth cutover owned by #726, #727, and #728. It makes the capacity and
failure boundary those later implementations must consume executable before
any user data moves.

The implementation covers four coupled surfaces:

1. a shared capacity preflight and typed persistence failure contract;
2. a migration failure outcome that forbids cutover and requires legacy-source
   retention;
3. a user-facing recovery component with backup and retry actions; and
4. an exact generated-manifest permission invariant for Chrome and Firefox.

## Durability permission decision

TABBIN will add `unlimitedStorage` to the required extension permissions.
TABBIN is local-first and has no server-side recovery authority for saved URLs,
notes, AI conversations, attachments, or analytics data. Losing or silently
evicting the only copy is therefore a higher product risk than the additional
storage permission.

The decision is based on current browser documentation:

- Chrome states that `unlimitedStorage` applies to extension and web storage
  APIs, removes normal quota restrictions, and exempts extension storage from
  eviction. It also documents `navigator.storage.persist()` as an eviction-only
  alternative: <https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies>
- Firefox documents that `unlimitedStorage` permits a persistent IndexedDB
  database without a creation-time permission prompt:
  <https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions#unlimited_storage>
- `StorageManager.persist()` may be refused and is unavailable in Web Workers,
  so it cannot be the sole MV3 background-service-worker durability mechanism:
  <https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist>

`unlimitedStorage` is not treated as proof that a disk write will succeed.
Disk exhaustion, unavailable storage, transaction aborts, hardware failures,
and explicit user deletion remain possible. Capacity preflight and typed write
failure handling therefore remain mandatory.

The permission grants no network, host, or user-content access. The production
manifest verifier will compare all required API permissions against one typed
allowlist for both generated manifests and reject missing, added, or optional
permissions. This is the #676 security invariant for this change.

## Capacity preflight

The migration planner supplies values measured from its actual source reader
and synthetic target fixture:

- serialized legacy source bytes;
- target expansion ratio;
- minimum reserve bytes; and
- reserve ratio.

The shared policy computes:

```text
projected target bytes = ceil(source bytes * target expansion ratio)
reserve bytes = max(minimum reserve, ceil(projected target bytes * reserve ratio))
required headroom = projected target bytes + reserve bytes
available bytes = estimated quota - estimated usage
```

The legacy source remains present while the target is written, so the required
headroom is for the complete projected target plus reserve. A caller may not
treat the source size alone as proof that migration fits. The target expansion
ratio is explicit rather than a hidden constant so #728's representative
fixture can replace the Phase 0 baseline without changing the policy boundary.

`navigator.storage.estimate()` is advisory. MDN describes `usage` and `quota`
as approximate and potentially obfuscated values:
<https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate>.
Missing, non-finite, rejected, or internally inconsistent estimates block the
preflight with `PERSISTENCE_CAPACITY_PREFLIGHT_FAILED`; they do not silently
allow migration.

Only counts and numeric sizes enter diagnostics. Raw URLs, titles, notes,
prompts, attachments, or filesystem/browser error messages are excluded.

## Failure and recovery contract

The minimum error codes are:

- `PERSISTENCE_QUOTA_EXCEEDED`;
- `PERSISTENCE_DISK_WRITE_FAILED`;
- `PERSISTENCE_STORAGE_UNAVAILABLE`; and
- `PERSISTENCE_CAPACITY_PREFLIGHT_FAILED`.

Quota and known storage-unavailable DOM exception names are classified
explicitly. Other target-write failures remain typed disk-write failures rather
than being collapsed into an empty result or generic persistence error.

Every capacity/write failure produces the same safety outcome:

```text
control state = failed
cutover allowed = false
legacy source action = retain
recovery actions = backup, retry
```

The recovery component explains that the update did not complete and that the
previous data was retained. It exposes backup and retry callbacks and never
accepts a raw browser error for rendering.

## Verification

- Node tests cover normal capacity, near-capacity rejection, invalid estimates,
  typed error classification, source retention, and retry readiness.
- DOM tests cover the recovery message and both actions without raw error
  leakage.
- Manifest policy tests cover exact Chrome MV3 and Firefox MV2 required API
  permissions plus rejection of added, missing, and optional permissions.
- Production builds and the generated-manifest verifier confirm Chrome and
  Firefox artifacts.
- Repository coverage, quality, security review, and release gates run before
  publication.
