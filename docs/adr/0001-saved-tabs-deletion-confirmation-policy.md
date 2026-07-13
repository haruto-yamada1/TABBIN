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
| Delete expired URLs                        | `autoDeletePeriod`                       | No runtime confirmation or Undo; default is `never`                                                          |
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
