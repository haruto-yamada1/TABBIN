# ADR 0001: Saved Tabs deletion and confirmation policy

## Status

Accepted

## Context

Saved Tabs exposes several operations that remove saved data or change how tabs
are opened. Their defaults were duplicated across domain and infrastructure,
and the intended confirmation criteria were not recorded. Custom-project URL
removal also cascaded into Domain mode even though its Undo snapshot covered
only the Custom project.

The reviewed operation inventory is:

| Operation                                  | Guard                                    | Recovery / effect                                                                                            |
| ------------------------------------------ | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Delete one saved URL                       | `confirmDeleteEach`                      | Full saved-tabs snapshot and Undo                                                                            |
| Delete groups or multiple saved URLs       | `confirmDeleteAll`                       | Full saved-tabs snapshot and Undo                                                                            |
| Remove URL(s) from a Custom project        | `confirmDeleteEach` / `confirmDeleteAll` | Custom-project snapshot and Undo; Domain URL is preserved                                                    |
| Remove after opening                       | `removeTabAfterOpen`                     | Saved-tabs UI provides Undo; browser-tab drag creation is an explicit consume action without an in-app toast |
| Remove after external drop                 | `removeTabAfterExternalDrop`             | No in-app confirmation or Undo                                                                               |
| Delete project/category/parent/subcategory | Unconditional confirmation               | Organization changes; project/category flows preserve the URL records                                        |
| Automatically expire saved URLs            | `autoDeletePeriod`                       | Defaults to `never`. Archived URLs can be restored for 30 days                                               |
| Open all in a new window                   | `openAllInNewWindow`                     | Changes window placement, not saved data                                                                     |

## Decision

The Saved Tabs domain is the source of truth for these defaults:

- opening a saved URL removes it by default because this explicit consume flow
  has Undo;
- external-drop removal is disabled by default because it has neither an
  in-app confirmation nor Undo;
- opening all URLs uses the current window by default;
- single and bulk URL deletion confirmation is opt-in because the actions are
  explicit and recoverable with Undo.

An explicit stored setting always overrides the default. No existing stored
value is migrated.

Confirmation is unconditional for deletion of a project, category,
parent-category, or subcategory because these operations alter user-created
organization. URL/group deletion uses `confirmDeleteEach` or
`confirmDeleteAll`; open-after removal relies on Undo; external-drop removal is
an explicit opt-in setting.

Removing a URL from a Custom project removes only that project's reference and
metadata. It does not delete the Domain-mode saved URL. Domain-mode deletion is
the global saved-URL operation and remains responsible for removing references
from all Custom projects.

### Automatic expiry recovery

The configured auto-delete period and favorite protection determine which
Domain-mode URLs expire. For each eligible URL, the background scan moves the
URL and its Domain and Custom memberships into the local IndexedDB
`expiredUrls` store. Each record contains the archive time, recovery deadline,
original URL, and information about its memberships and their former locations.
Moving the URL and its memberships to the archive is atomic. Standard saved-tab
lists and search read the active data.

The Periodic Execution settings show the archive time, recovery deadline and
former locations. Users can restore an individual URL, restore multiple URLs, or
permanently delete archived URLs. Recovery ends exactly 30 days after archiving.
The browser purges expired records at extension startup and through an hourly
cleanup alarm. Cleanup remains active while automatic deletion is disabled.

The archive holds up to 2,000 records and 8 MiB total measured as UTF-8 JSON.
Cleanup frees space before the scan adds new records. The scan leaves records
in the active list when it cannot archive them within these limits. An IndexedDB
failure aborts the transaction and keeps the data available for retry.

Expiration can remove an affected empty Domain collection when it has no
categories, parent group, or stored uncategorized position. Restoration reuses
the current collection for the canonical domain or reconstructs it from the
archived collection. A parent group is reinstated only if it still exists.
Memberships return to their original category if that ID still belongs to the
destination collection. Otherwise they return uncategorized. When a former
Custom project is gone, its membership goes to the standard Custom
uncategorized collection. Notes from missing projects are combined with notes
already in the fallback membership. If the combined note would exceed the
Backup V2 per-membership byte limit, the restore stops and the archive remains
available. Restored memberships retain their original numeric sort positions. The existing ID ordering breaks ties.

For a URL that is absent from the active list, restoration preserves its
first-saved date and sets its last-saved date to the later of the restoration
time and the archived last-saved date. If that normalized URL is already
active, recovery keeps its current metadata, dates, and memberships and fills
in missing memberships. When multiple archived versions of a URL are selected
together, recovery starts with the most recently archived version. It restores
direct memberships across the selection before appending notes from deleted
projects to the fallback membership.

Public Backup V2 and pre-import recovery snapshots cover active saved tabs.
Import and pre-import snapshot restoration leave the local archive in place
with the original recovery deadlines. The IndexedDB version 2 upgrade creates
the archive store while preserving existing data. The Backup V2 format and
persistence generation remain compatible. The browser rejects attempts to open
the upgraded database at version 1. Rollback fixes must run on version 2.

## Consequences

New users and older partial settings objects no longer remove a saved URL after
external drag-and-drop unless they opt in. Existing explicit preferences are
preserved. Custom-project Undo now fully restores the mutation it represents,
and the settings defaults cannot drift between domain and storage adapters.

## Alternatives

- Document the current behavior without code changes: rejected because policy
  duplication and incomplete Undo would remain.
- Confirm every deletion by default: rejected because recoverable explicit
  actions do not justify changing existing stored behavior.
- Preserve the cascade and add a larger compatibility snapshot: rejected
  because it retains a surprising cross-mode side effect in a project-scoped
  operation.
