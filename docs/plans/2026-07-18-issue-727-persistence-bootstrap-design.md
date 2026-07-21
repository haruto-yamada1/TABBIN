# Issue #727 PersistenceBootstrap Design

## Context

Persistence Model v2 already has typed domain records, IndexedDB connection and
transaction adapters, integrity checking, durability policy, and cross-context
invalidation. It does not yet have one authoritative migration readiness
barrier. Current legacy migrations are still invoked from several entrypoints,
and a module-local Promise cannot stop another extension context from reading or
writing while migration is in progress.

Issue #727 owns the readiness and coordination boundary. Issue #728 continues to
own the actual legacy-to-v2 mapping, source fingerprinting, target write, and
semantic verification.

## Considered approaches

### 1. Call `ready()` from every hook and entrypoint

This preserves the current shape but leaves correctness dependent on every new
caller remembering the call. It also cannot keep a migration exclusive while a
different context starts a write. Rejected.

### 2. Use only a module-global initialization Promise

This gives useful same-context single-flight behavior, but MV3 restarts and
options/background page separation create new JavaScript runtimes. Rejected as
the correctness boundary.

### 3. Authoritative control state plus a shared/exclusive operation barrier

Adopted. A single control-plane record in `chrome.storage.local` is authoritative.
All normal reads and writes take a shared Web Lock, re-read the control state,
and then execute against the route allowed by that state. Migration/recovery
takes the same lock exclusively. The module-global Promise is retained only as
a same-context optimization.

## Architecture

The application layer defines:

- `PersistenceControlState`, including `legacy`, `migrating`, `verifying`,
  `cutover-pending`, `indexeddb`, `failed`, and `read-only-emergency`;
- typed transition commands and a pure transition policy;
- ports for control-state persistence, access-policy initialization,
  cross-context coordination, and the #728 migration lifecycle;
- `PersistenceBootstrapService`, which performs access-policy setup,
  same-context single-flight, and restart recovery; and
- `PersistenceOperationGateService`, which holds the shared barrier for the
  complete read or write callback and enforces the selected route.

Infrastructure supplies a Chrome storage control-state repository and a Web
Locks coordinator. Composition exposes gated legacy storage and requires the
same operation gate when constructing IndexedDB query, snapshot, and unit-of-work
adapters. Component and hook code does not own migration readiness.

## Authoritative state

The key `tabbin:persistenceControlState:v2` is control-plane data. It is not a
domain record, user-facing setting, Backup V2 resource, or #739 invalidation
event.

```ts
type PersistenceControlState =
  | { readonly status: 'legacy' }
  | { readonly status: 'migrating'; readonly migrationId: string }
  | { readonly status: 'verifying'; readonly migrationId: string }
  | { readonly status: 'cutover-pending'; readonly migrationId: string }
  | {
      readonly status: 'indexeddb'
      readonly migrationId: string
      readonly persistenceGeneration: 2
    }
  | {
      readonly status: 'failed'
      readonly migrationId?: string
      readonly errorCode: PersistenceBootstrapErrorCode
    }
  | {
      readonly status: 'read-only-emergency'
      readonly readSource: 'legacy' | 'indexeddb'
      readonly migrationId?: string
    }
```

An absent record means the pre-cutover `legacy` state. Invalid stored data is a
typed failure; IndexedDB object-store presence is never used to infer cutover.

Allowed normal transitions are:

```text
legacy or failed -> migrating
migrating -> verifying or failed
verifying -> cutover-pending or failed
cutover-pending -> indexeddb or failed
legacy, indexeddb, or failed -> read-only-emergency
```

Migration IDs must match across an in-progress transition. Invalid transitions
are rejected before storage mutation.

## Coordination and recovery

The lock name is stable across extension contexts. Normal operations request
`shared`; migration and recovery request `exclusive`. Missing or rejected Web
Locks capability becomes `PERSISTENCE_COORDINATION_UNAVAILABLE`; lockless
migration is not attempted.

`PersistenceBootstrapService.ready()` treats only stable states as ready.
`migrating`, `verifying`, `cutover-pending`, and recoverable `failed` states are
resumed exclusively through an injected migration lifecycle port. The port owns
copy and verification logic; the bootstrap owns state transitions and the
barrier. A service-worker restart therefore reconstructs the service from the
persisted state and resumes the appropriate phase without a stale module Promise.

`cutover-pending` means verification already completed. Recovery may finalize
only that typed state; a mere IndexedDB record cannot skip verification.

## Read/write policy

| Control state                                 |                Legacy read | Legacy write |             IndexedDB read | IndexedDB write |
| --------------------------------------------- | -------------------------: | -----------: | -------------------------: | --------------: |
| `legacy`                                      |                        yes |          yes |                         no |              no |
| `migrating` / `verifying` / `cutover-pending` |                         no |           no |                         no |              no |
| `indexeddb`                                   |                         no |           no |                        yes |             yes |
| `failed`                                      |                         no |           no |                         no |              no |
| `read-only-emergency`                         | matching `readSource` only |           no | matching `readSource` only |              no |

The gate re-reads state while holding the shared lock. A successful earlier
`ready()` call cannot authorize a later write after another context changed the
control state.

## Trusted-context policy

Before reading the control key, the Chrome adapter requests
`TRUSTED_CONTEXTS` with `storage.local.setAccessLevel`. The API applies to the
whole storage area, so the production manifest invariant that no content script
is declared remains security-sensitive.

If a browser does not expose `setAccessLevel`, the adapter may continue only
after reading the runtime manifest and proving that no content scripts are
declared. Missing capability plus an uninspectable or content-script-enabled
manifest is a typed fail-closed error. Vitest uses an explicitly injected test
capability; production does not silently fall back.

## Failure and data safety

- Access-policy, coordination, control-state decoding, migration, and
  verification failures are typed.
- A failed bootstrap does not invoke the requested repository operation.
- The bootstrap contract contains no legacy deletion capability.
- #728 must keep legacy cleanup outside the migration lifecycle and after a
  verified cutover decision.
- Error messages and diagnostics contain migration IDs/error codes, not URL,
  title, notes, AI content, or imported data.

## Verification

Tests cover same-context single-flight, background-first, options-first, two
simultaneous contexts, migration and verification failure, retry, restart from
`verifying` and `cutover-pending`, invalid transitions, stale route rejection,
read-only emergency enforcement, access-policy failure, and absence of control
state from Backup V2 and #739 payloads.

An architecture regression test inventories the minimum production paths from
the Issue and fails when a path bypasses the persistence gate.
