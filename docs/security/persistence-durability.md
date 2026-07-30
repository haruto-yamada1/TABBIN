# Persistence durability policy

## Decision

TABBIN requires the `unlimitedStorage` extension permission for Persistence
Model v2. The product is local-first and does not have a server-side recovery
authority for user data. Preventing quota eviction of the only durable copy is
therefore part of the data-safety boundary.

Chrome documents that `unlimitedStorage` applies to extension and web storage
APIs, removes normal quota restrictions, and exempts extension storage from
eviction. Firefox documents that it permits an extension to create a persistent
IndexedDB database without a creation-time prompt.

- Chrome: <https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies>
- Firefox: <https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions#unlimited_storage>

The permission does not grant host, network, or user-content access. The typed
allowlist in `src/constants/extensionPermissions.ts` is used by WXT and the
generated-manifest verifier. Chrome MV3 and Firefox MV2 artifacts must contain
exactly the reviewed API permissions. Added, missing, or optional permissions
fail release verification.

### User and store-review impact

The benefit is that the browser may retain the only durable local copy beyond
its normal quota and eviction policy. The cost is that TABBIN may consume more
local disk space, while users and the browser can still remove extension data
and a full or unavailable disk can still reject writes.

Chrome's current permission-warning list does not assign an install warning to
`unlimitedStorage`. Firefox grants persistent IndexedDB access without a
database-creation prompt. These browser behaviors may change, so every store
submission that changes the permission allowlist must re-check the current
Chrome and Firefox review surfaces. The submission notes must justify
`unlimitedStorage` as protection for local-only user data and must not claim
that it guarantees successful writes. If a store begins showing a new warning,
the release must explain the storage purpose to users before publication.

- Chrome permission warnings: <https://developer.chrome.com/docs/extensions/reference/permissions-list>
- Firefox permission behavior: <https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/permissions#unlimited_storage>

`navigator.storage.persist()` is not the primary policy because a browser may
refuse the request and the method is unavailable in Web Workers, including the
MV3 background-service-worker execution model. It may be used later from a
supported extension page as defense in depth, but refusal must not bypass
capacity or write-failure handling.

## Capacity preflight

Before a migration target write, the migration planner must obtain:

- the UTF-8 byte size of the serialized legacy source;
- privacy-safe source entity counts;
- `navigator.storage.estimate()` usage and quota when available;
- a target expansion ratio measured by the migration's synthetic fixture;
- a minimum reserve and reserve ratio.

The shared contract in `src/lib/persistence/capacity.ts` computes:

```text
projected target bytes = ceil(source bytes * target expansion ratio)
reserve bytes = max(minimum reserve, ceil(projected target bytes * reserve ratio))
required headroom = projected target bytes + reserve bytes
available bytes = estimated quota - estimated usage
```

The Phase 0 contract test uses a `1.5` synthetic target expansion ratio to
exercise temporary duplication and reserve behavior. The actual #728 migration
fixture must measure and supply its own ratio; production code does not hide an
unverified default.

The complete target plus reserve must fit while the legacy source is retained.
Comparing source bytes with quota is insufficient. `StorageManager.estimate()`
values are approximate, may be padded or obfuscated, and cannot prove that the
underlying disk write will succeed:
<https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate>.

Missing, rejected, non-finite, or inconsistent estimates block migration with
`PERSISTENCE_CAPACITY_PREFLIGHT_FAILED`. `unlimitedStorage` never changes this
fail-closed rule.

## Typed failures and migration safety

Persistence capacity and write failures use these codes:

- `PERSISTENCE_QUOTA_EXCEEDED`;
- `PERSISTENCE_DISK_WRITE_FAILED`;
- `PERSISTENCE_STORAGE_UNAVAILABLE`;
- `PERSISTENCE_CAPACITY_PREFLIGHT_FAILED`.

`QuotaExceededError` maps to the quota code. Known unavailable storage states
map to the unavailable code. Other target-write or transaction-abort errors
remain typed disk-write failures. No path converts these failures to an empty
data result or generic success.

Every failure outcome has the following immutable safety semantics:

- migration control state is `failed`;
- cutover is forbidden;
- the legacy source must be retained;
- partial target data is not authoritative;
- backup and retry are the available recovery actions.

The concrete #727/#728 control state and migration executor must consume this
outcome. #733 cleanup is not eligible until migration succeeds, source/target
verification passes, and its separate retention period and integrity checks are
satisfied.

## Recovery UI and safe diagnostics

`PersistenceCapacityRecovery` explains the typed reason, states that previous
data was not deleted, and offers backup and retry. The component accepts no raw
browser error, filesystem path, URL, title, note, prompt, or attachment data.

Pre-import recovery snapshots are also local-only. Their payload is a strict
logical Backup V2 projection stored in the extension's IndexedDB and is never
sent through telemetry, diagnostics, logs, or #739 change events. Recovery
errors expose fixed codes/messages only. The Options UI receives summary
metadata (`id`, timestamps, serialized bytes, and source revision), never the
snapshot content.

Restore compensation keeps the pre-restore logical state and settings only in
memory. Its typed outcome may expose the compensation revision, logical
invalidation scopes, and failed notification stage, but never either state's
content. A post-commit notification failure is partial success rather than a
false rollback signal.

Diagnostics may contain only:

- fixed-kind entity counts;
- approximate serialized source bytes;
- estimated usage and quota;
- failed stage; and
- typed error code.

Diagnostic data stays local under the existing production outbound-network
policy. Adding capacity telemetry to an external request requires a separate
privacy and security review and is not allowed by this policy.

## Browser differences

| Browser | `unlimitedStorage` effect used by TABBIN                                                                  | Remaining failure modes                                                |
| ------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Chrome  | Exempts extension/web storage APIs from normal quota and eviction                                         | Disk exhaustion, unavailable storage, transaction abort, user deletion |
| Firefox | Allows persistent IndexedDB without the creation-time permission prompt and removes `storage.local` quota | Disk exhaustion, unavailable storage, transaction abort, user deletion |

Both generated manifests are built and checked during `release:check`. Browser
differences do not change the typed error or recovery contract.
