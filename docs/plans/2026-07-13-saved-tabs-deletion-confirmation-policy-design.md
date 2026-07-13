# Saved Tabs Deletion Confirmation Policy Design

## Context

Saved Tabs has five settings that govern actions which can change saved data or
the window model. Their defaults are duplicated between the domain and the
Chrome storage adapter, so the product policy can drift. The destructive flows
also have two inconsistencies:

- removing a URL from one Custom project silently removes the same saved URL
  from Domain mode, although Undo restores only the Custom project snapshot;
- project deletion performs a guaranteed-to-fail uncategorized-project delete
  before the real delete and suppresses that error.

## Decision

The domain owns one exported default policy for the five action settings. Both
the domain fallback and the storage adapter compose that policy into their full
settings defaults.

| Setting                      | Default | Reason                                                                                     |
| ---------------------------- | ------- | ------------------------------------------------------------------------------------------ |
| `removeTabAfterOpen`         | `true`  | Opening is an explicit consume action and the saved-tabs UI provides Undo.                 |
| `removeTabAfterExternalDrop` | `false` | External drop removal has no in-app confirmation or Undo, so new users must opt in.        |
| `openAllInNewWindow`         | `false` | Opening in the current window avoids an unexpected extra window.                           |
| `confirmDeleteAll`           | `false` | Explicit URL/group deletion is recoverable through Undo; users can opt into confirmation.  |
| `confirmDeleteEach`          | `false` | Explicit single-URL deletion is recoverable through Undo; users can opt into confirmation. |

Existing stored values remain authoritative. The changed external-drop default
only applies when the setting has never been stored or is absent from an older
partial settings object.

Custom-project URL removal is project-scoped: it removes only that project
reference and metadata. The Domain-mode saved URL remains. Global saved-URL
deletion continues to originate in Domain mode and removes stale references
from all Custom projects. This makes the mutation match the operation name and
makes the existing Custom-project snapshot sufficient for Undo.

Project, category, parent-category, and subcategory deletion continue to show
an unconditional confirmation because they alter user-created organization and
are not governed by the URL deletion confirmation settings.

## Alternatives considered

- Documentation only was rejected because it would preserve duplicated policy
  and the incomplete Undo behavior.
- Enabling every confirmation by default was rejected because explicit URL
  deletion already has Undo and there is no evidence that existing users should
  receive a behavior migration.
- Expanding Custom-project Undo to snapshot Domain mode was rejected because it
  would preserve an unexpected cross-mode side effect instead of correcting the
  project-scoped operation.

## Verification

Regression tests cover the canonical defaults, preservation of explicit stored
values, project-scoped single and bulk deletion, and one-call project deletion.
The repository quality, coverage, and release gates verify the wider flow.
