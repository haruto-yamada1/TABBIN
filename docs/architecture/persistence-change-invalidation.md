# Persistence change invalidation protocol

## Purpose and boundary

Persistence Model v2 uses a revisioned invalidation protocol to tell another
TABBIN extension context that its Query result may be stale. The transport is a
`BroadcastChannel` named `tabbin:persistence-change:v1`. Only background and
page contexts with the same extension origin participate. Chrome MV3 and
Firefox MV2 use the same JSON-safe event contract.

The event is an invalidation hint. It is never a source of truth, a cache-data
message, an event-sourcing record, or a substitute for a Query. Consumers always
re-read the current consistent Query snapshot from Persistence Model v2.

Settings are deliberately outside this protocol. `userSettings`, active AI
selection, release controls, and migration controls remain in the
`chrome.storage.local` control plane and continue through a settings-specific
change boundary.

## Event contract

Every message on `tabbin:persistence-change:v1` has exactly this shape:

```ts
type PersistenceChangeEvent = {
  readonly changeId: string
  readonly revision: number
  readonly scopes: readonly PersistenceChangeScope[]
}

type PersistenceChangeScope =
  | 'analyticsViews'
  | 'categories'
  | 'collections'
  | 'conversations'
  | 'groups'
  | 'memberships'
  | 'recoverySnapshots'
  | 'urls'
```

`changeId` identifies one post-commit publication attempt. `revision` is the
committed Persistence Model v2 revision, and `scopes` is the exact set of
logical stores changed by that commit. The protocol has only the eight scopes
above; in particular, it has no settings scope.

Inbound adapters validate the whole value before exposing it through
`PersistenceChangePort`: it must be a plain JSON-safe object with no unknown
fields, a non-empty `changeId`, a positive safe-integer `revision`, and a
non-empty, duplicate-free `scopes` array containing only the allowlisted values.
Invalid messages are discarded. Diagnostics may report the failure category
and redacted protocol metadata, but must not log the raw message.

The event must not contain URLs, titles, notes, prompts, attachments, domains,
conversation content, settings, or any other user data. A publisher derives the
event only from the committed revision, committed scopes, and a newly generated
identifier.

## Publisher ordering and partial success

The application post-commit service follows this order:

1. await the IndexedDB transaction `complete` event;
2. receive its committed `revision` and changed `scopes`;
3. generate `changeId` outside the transaction;
4. await publication through `PersistenceChangePort`.

An aborted transaction has no commit result and publishes nothing. ID
generation and publication never run inside the IndexedDB transaction.

An ID-generation or publication failure after `complete` is a typed partial
success: the domain mutation and revision are already committed, while only the
invalidation notification failed. The result/error boundary must retain the
committed revision and scopes and identify the failed post-commit stage. It
must never imply rollback, and callers must not retry the mutation as though it
were uncommitted. A consumer recovers through the current persisted revision.

Awaiting publication means awaiting the transport adapter's completion. It does
not provide consumer acknowledgement, durable delivery, or replay.

## Consumer algorithm

A consumer applies the following algorithm:

1. Subscribe before starting its initial Query so a commit cannot be lost
   between the initial read and listener registration.
2. Strictly validate every inbound message, then keep only events whose scopes
   intersect the consumer's declared scopes.
3. Ignore duplicate `changeId` values, stale revisions at or below the last
   applied revision, and unrelated scopes.
4. Serialize refresh work. While a Query is in flight, coalesce relevant events
   to the highest observed revision instead of starting parallel reads.
5. Re-run the current consistent Query and replace the projection/cache with
   the returned snapshot. Advance the applied revision from that Query result,
   never from the event alone. If a higher pending revision remains, run the
   serialized refresh again.

Events that arrive during the initial Query are processed against the revision
returned by that Query. Out-of-order and duplicate delivery is therefore safe.
The event carries no projection data to merge.

Missed delivery is normal: `BroadcastChannel` has no durable queue, and an
extension page close or service-worker restart discards listeners and pending
messages. Initial load, page focus, an explicit current-revision check, and an
explicit user refresh compare/re-query the persisted current revision and
repair stale state. This is recovery at normal lifecycle boundaries, not
polling. TABBIN does not persist or replay protocol events and does not build an
event-sourcing log.

## Consumer matrix

| Consumer             | Relevant scopes                                              | Refresh behavior                                                                                                    |
| -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Saved Tabs           | `urls`, `collections`, `memberships`, `categories`, `groups` | Re-run the Saved Tabs Query and replace its revisioned projection.                                                  |
| Analytics            | `urls`, `collections`, `memberships`                         | Re-run the analytics Query from the current consistent snapshot.                                                    |
| AI saved-URL context | `urls`, `collections`, `memberships`                         | Mark the URL context stale and re-read it at the next Query/tool boundary; do not push user data through the event. |
| Settings             | none                                                         | Retain the settings-specific `chrome.storage.local` control-plane change path.                                      |

## Cache policy

A cache may store a Query DTO together with the revision returned by that
Query. A relevant event invalidates or schedules replacement of that cache; it
never updates cache data and never proves that the cache reached the event's
revision. Consumers may retain a known-good projection while a serialized
refresh is running, but must not present it as current after detecting a newer
persisted revision. Query failure leaves the cache stale and retryable at the
next recovery boundary.

Scope filtering is only a refresh optimization. The persisted revision remains
the repair authority when an event is missed, a process restarts, or a cache's
scope metadata is uncertain.

## Legacy migration boundary

The #739 protocol is additive before #729. It does not claim that the current
legacy UI has already cut over. Until the Persistence Model v2 projection is
authoritative, the existing `StorageChangePort` and
`chrome.storage.onChanged` domain-key paths continue to synchronize legacy UI
state.

After the #729 cutover:

- domain-key branches are removed from the legacy storage-change path;
- Saved Tabs uses `PersistenceChangePort` plus Query re-read for v2 domain
  projections; and
- settings move to a settings-specific control-plane boundary rather than a
  persistence-change scope.

This staging keeps rollback and removal safe. Before #729, the publisher and
listener can be removed without changing the legacy source of truth. After
cutover, disabling the transport still leaves IndexedDB and its revision as the
source of truth; lifecycle and explicit refresh paths repair consumers while a
transport fix or rollback is prepared.

## Transport decision

`BroadcastChannel` is the selected transport because it is a same-origin
one-to-many invalidation primitive available to the participating extension
background/page contexts. It transports the same small structured-clone-safe
object on Chrome MV3 and Firefox MV2 and does not turn notification into another
durable write.

Rejected alternatives:

- `runtime.sendMessage`: its receiver/response lifecycle and service-worker
  targeting semantics are unnecessary for a lossy one-to-many hint, and it
  still would not make delivery durable.
- a `chrome.storage.local` marker: it would add a second persistence write,
  ordering and cleanup state to a protocol whose authority is already the
  IndexedDB revision.
- a hybrid transport: two delivery paths create ordering, duplicate, failure,
  and rollback states without improving correctness; revision repair already
  handles loss.

The protocol intentionally has no acknowledgement, polling fallback, stored
event replay, or event-source projection.

## Security and browser parity

The channel is internal to the extension origin. It adds no extension API
permission, host permission, `externally_connectable` entry,
`web_accessible_resources`, content script, or network endpoint. Strict inbound
validation and the metadata-only payload keep user content outside the
transport.

| Surface                       | Chrome MV3                                                        | Firefox MV2                                   |
| ----------------------------- | ----------------------------------------------------------------- | --------------------------------------------- |
| Participating contexts        | Extension service worker and extension pages                      | Extension background page and extension pages |
| Channel and event             | `tabbin:persistence-change:v1`; exact JSON-safe contract above    | Same                                          |
| Delivery guarantee            | Best effort; restart/close loss is repaired from current revision | Same                                          |
| Manifest/API permission       | None added                                                        | None added                                    |
| External/WAR/network exposure | None                                                              | None                                          |
