# Runtime messaging trust boundary

This document defines the trust levels of runtime message senders in TABBIN,
which actions are privileged, and which manifest or source changes trigger a
trust-boundary review. It is the companion to
[`permissions.md`](permissions.md): `permissions.md` owns the manifest permission
surface, this document owns the runtime messaging sender policy.

## Current messaging model

TABBIN uses `chrome.runtime.onMessage` for internal communication between
extension pages (options, saved-tabs, changelog) and the background service
worker. Messages are validated with Zod schemas in `src/types/background.ts`
(`backgroundMessageSchema`, `messageActionSchema`) before any handler runs. The
background handler lives in `src/lib/background/message-handler.ts`.

There are no manifest-declared content scripts, no `externally_connectable`
surface, and no `onMessageExternal` listener. The optional saved-title marker
uses programmatic isolated-world injection as reviewed below. The generated manifest verifier in
`tools/scripts/production-network-policy.ts` enforces this by rejecting
`externally_connectable` and non-empty `content_scripts` in the generated
Chrome and Firefox manifests.

### Optional saved-title injection

The saved-title marker runs only after the user enables it and grants optional
`scripting` plus HTTP(S) site access. This is an untrusted page-adjacent context.
Its injected function changes/observes only document titles, and accepts only
same-extension ownership inspection and restoration requests. It has no outgoing runtime
requests, extension-storage calls, network calls, page-body reads, or HTML
rendering. Page scripts can observe title changes. It does not register a
persistent or manifest content script, and arbitrary non-HTTP(S), restricted,
or incognito pages are excluded.

The background message listener requires a trusted same-extension page sender
before dispatching privileged actions. A matching extension ID alone is not
sufficient: content scripts carry the extension ID too. The sender must use a
known same-extension page URL at the top frame and have a matching extension ID
and origin when supplied. Web-page URLs, foreign extensions, subframes, and
incognito tabs are rejected. A known extension page opened in a normal tab is
allowed. An extension-page
refresh relay carries no URL or other page content and only asks the background
to recompute the existing local saved-status projection. Injected contexts
cannot use it to read or mutate saved data. There is no external message surface
or web-accessible resource change.

Chrome's storage access-level API is not relied on as a portable Firefox
boundary: injected code contains no storage access path or storage-bearing
messages, while the background independently rejects page-adjacent senders.
Adding a storage call or privileged outgoing message to injected code requires
a new trust-boundary review. An explicit save may run a read-only isolated-world
ownership probe while site access remains granted, even if title display is off;
it reads no page body and sends no page-initiated message. Uncertain marked
captures stop before persistence or closure. The opt-in boolean remains device-local and is
excluded from Backup V2 and recovery snapshots.

## Sender types and trust levels

| Sender type                                     | Transport                                                 | Trust level                     | Validation required                                                                      |
| ----------------------------------------------- | --------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------- |
| Extension page (options, saved-tabs, changelog) | `chrome.runtime.sendMessage` / `chrome.runtime.connect`   | Trusted extension context       | Same-extension page sender guard + Zod payload schema                                    |
| Background service worker (self)                | direct calls                                              | Trusted extension context       | internal function contracts                                                              |
| Content script                                  | `chrome.runtime.sendMessage` from injected content script | Untrusted page-adjacent context | Zod payload schema + sender origin allowlist + privileged-action sender policy           |
| External web page                               | `chrome.runtime.sendMessage` via `externally_connectable` | Untrusted external context      | Zod payload schema + sender origin/extension allowlist + privileged-action sender policy |
| External extension                              | `chrome.runtime.onMessageExternal`                        | Untrusted external context      | Zod payload schema + sender extension-id allowlist + privileged-action sender policy     |

The current policy treats only extension-page and background senders as trusted.
Content-script and external senders are untrusted and must not reach privileged
actions without an explicit sender policy.

## Privileged actions

Privileged actions mutate user data, persistence state, or trigger external
requests. The current background message actions and their privileged-action
classification:

| Action                                      | Privileged kind               | Current sender policy          |
| ------------------------------------------- | ----------------------------- | ------------------------------ |
| `removeUrlFromStorage`                      | URL / storage record deletion | trusted extension context only |
| `removeUrlRecordsFromStorage`               | URL / storage record deletion | trusted extension context only |
| `updateTabTimestamps`                       | timestamp update              | trusted extension context only |
| `checkExpiredTabs`                          | auto-delete execution         | trusted extension context only |
| `runAiChat`                                 | AI request execution          | trusted extension context only |
| `listOllamaModels`                          | AI request execution (read)   | trusted extension context only |
| `urlDragStarted` / `urlDropped`             | URL storage mutation          | trusted extension context only |
| `calculateTimeRemaining` / `getAlarmStatus` | read-only                     | trusted extension context only |

Persistence Model v2 adds these privileged actions (tracked in #727):

- persistence migration state transition;
- source-of-truth cutover;
- legacy cleanup eligibility / execution;
- recovery snapshot restore.

These are privileged because a bad state transition can delete the only durable
copy of user data. They must not be reachable from content-script or external
senders.

## Sender policy for untrusted contexts

The programmatic saved-title injection introduces an untrusted context, so
the background now distinguishes trusted extension pages before dispatching
messages or connecting AI stream ports. The minimum policy remains:

1. Validate every message with the existing Zod schema regardless of sender.
2. For untrusted senders, check the sender against an explicit allowlist:
   - content script: allowed `sender.origin`/`sender.url` patterns;
   - `externally_connectable`: allowed `sender.origin` matches;
   - `onMessageExternal`: allowed `sender.id` extension IDs.
3. Reject privileged actions from untrusted senders. Privileged actions are
   only dispatched for trusted extension contexts.
4. Never relax the Zod schema for untrusted senders. Untrusted senders get the
   same schema plus the sender allowlist, not a weaker schema.

The current same-extension page guard applies to every message and AI stream
port. No injected context is allowed to dispatch an action, including the
metadata-free title refresh. External messaging remains disabled.

## Trust-boundary review triggers

The following changes require a trust-boundary review before merge:

- Adding any `content_scripts` entry to the manifest or `wxt.config.ts`.
- Adding programmatic script injection or changing the injected function's API,
  storage, messaging, or page-content access.
- Adding `externally_connectable` to the manifest or `wxt.config.ts`.
- Adding an `onMessageExternal` listener in source.
- Adding a `chrome.runtime.onConnectExternal` listener in source.
- Adding a new privileged action to the background message handler.
- Adding a new persistence migration control key writer (see
  [Migration control key trust boundary](#migration-control-key-trust-boundary)).

The generated manifest verifier fails loudly when `content_scripts` becomes
non-empty or `externally_connectable` appears, so a build failure is the trigger
to start this review. A source-level architecture guard in
`src/lib/architecture/messagingTrustBoundary.test.ts` also detects
`onMessageExternal` / `onConnectExternal` listener additions in production
source so they cannot land silently.

The review must update this document with: the new sender type, its allowlist,
the privileged actions it may or may not reach, and the validation applied.

## Migration control key trust boundary

Persistence Model v2 introduces migration control state (for example
`legacy`, `migrating`, `verifying`, `cutover-pending`, `indexeddb`, `failed`)
that drives source-of-truth cutover. This state is critical: a wrong transition
can delete the only durable copy of user data.

Policy:

- Migration control state is read and written only from the migration control
  repository designated in #727. Other features and content scripts must not
  write critical control keys directly.
- Critical control key names are documented and allowlisted at the production
  source level so ad-hoc writes are detected.
- Content scripts and untrusted external senders must not reach migration
  state-transition privileged actions (see
  [Privileged actions](#privileged-actions)).
- When `content_scripts` is introduced, a storage access boundary review is
  required in addition to the messaging trust-boundary review. On Chrome,
  evaluate `chrome.storage.local.setAccessLevel({ accessLevel:
  'TRUSTED_CONTEXTS' })` to keep control-plane storage off-limits to content
  scripts; confirm Firefox capability parity and encapsulate the difference in
  the browser adapter.
- Fail-closed: when a storage access boundary is unsupported, the policy must
  not fail open to "any context may write control state."

The authoritative state machine and repository boundary are owned by #727. This
document owns the security invariant and review-trigger side. Until #727 lands
the repository boundary, the source-level guard tracks critical control key
literals and flags new writers for review rather than allowing silent additions.

## Related

- [`permissions.md`](permissions.md) — manifest permission allowlist and
  generated-manifest security invariants.
- [`persistence-durability.md`](persistence-durability.md) — `unlimitedStorage`
  durability decision.
- [`production-network-policy.md`](production-network-policy.md) — outbound
  network policy and call-site inventory.
- #676 — permissions docs, manifest invariants, and trust-boundary framework.
- #727 — PersistenceBootstrap and migration control repository boundary
  (authoritative for migration state machine).
- #735 — `unlimitedStorage` adoption decision (closed).
