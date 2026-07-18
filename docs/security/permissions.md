# Chrome extension permissions

This document explains why TABBIN requests each extension permission and host
permission, where each one is used, and how the generated manifest is verified.
It is the review surface for store submissions, security reviews, and future
permission additions.

The typed permission allowlist lives in
`src/constants/extensionPermissions.ts` and the host permission allowlist lives
in `src/constants/productionNetworkPolicy.ts`. WXT reads these constants in
`wxt.config.ts`, so the generated Chrome and Firefox manifests are derived from
a single source of truth. The generated-manifest verifier in
`tools/scripts/production-network-policy.ts` checks the final artifacts against
the same allowlists, plus the security invariants in
[Generated manifest security invariants](#generated-manifest-security-invariants).

TABBIN is local-first. The only outbound network destination is the user's own
local Ollama service. No permission here grants remote server, telemetry, or
user-content transmission access. The production outbound network policy is
documented in
[`production-network-policy.md`](production-network-policy.md).

## API permissions

### `alarms`

Purpose: schedule periodic expiration checks and auto-delete notifications
without keeping the service worker alive manually.

Primary usage sites:

- `src/lib/background/alarm-notification.ts` — registers and clears alarms for
  expiration and auto-delete timing.
- `src/lib/background/message-handler.ts` — reads alarm status in response to
  `getAlarmStatus` messages.

Review notes: `alarms` does not grant host, content, or network access. It only
schedules timed wake-ups for the background service worker.

### `tabs`

Purpose: read the currently open tabs (URL, title, window membership) so the
user can save them, and open previously saved tabs back into a window.

Primary usage sites:

- `src/lib/background/extension-actions.ts` — opens saved URLs/tabs and queries
  the active tab.
- `src/lib/background/url-storage.ts` — records tab timestamps for expiration.
- `src/lib/background/utils.ts` — tab lookup helpers (same-window, same-domain).
- `src/lib/background/saved-tabs-page.ts` — opens the saved-tabs page.
- `src/entrypoints/background.ts` — wires tab-created and tab-activated handlers
  for timestamp tracking.
- `src/app/composition/createSavedTabsPorts.ts`,
  `src/app/composition/createSavedTabsUseCases.ts` — composition root ports.
- `src/contexts/saved-tabs/presentation/hooks/useProjectCrudHandlers.ts`,
  `src/contexts/saved-tabs/domain/services/OpenedUrlRemovalPolicy.ts`,
  `src/contexts/saved-tabs/infrastructure/browser/ChromeStorageChangeAdapter.ts`
  — saved-tabs feature read/write paths.

Review notes: `tabs` grants access to tab metadata (URL, title) for tabs the
user is already viewing. TABBIN does not read tab content or inject scripts into
pages. Tab data stays local and is never transmitted off-device.

### `storage`

Purpose: persist `savedTabs`, `urls`, `userSettings`, `customProjects`, and
persistence migration control state through `chrome.storage.local`.

Primary usage sites:

- `src/lib/browser/chrome-storage.ts` — shared storage wrapper.
- `src/lib/storage/tabs.ts`, `src/lib/storage/settings.ts`,
  `src/lib/storage/projects.ts` — domain storage records.
- `src/lib/background/url-storage.ts` — URL record storage and removal.
- `src/lib/background/expired-tabs.ts` — expiration state.
- `src/lib/background/ai-chat.ts` — chat history persistence.
- `src/entrypoints/background.ts` — storage change wiring.
- `src/app/composition/createSavedTabsRepositories.ts` — repository composition.

Review notes: `storage` is the local persistence boundary. It does not grant
network access. The `unlimitedStorage` durability decision and the migration
control-plane storage access boundary are documented in
[`persistence-durability.md`](persistence-durability.md) and
[`messaging-trust-boundary.md`](messaging-trust-boundary.md).

### `contextMenus`

Purpose: add the right-click "save tab" entry so users can save the current tab
without opening the saved-tabs page.

Primary usage sites:

- `src/lib/background/context-menu.ts` — creates the context menu item and
  handles clicks by saving the active tab.

Review notes: `contextMenus` only adds entries to the browser context menu. It
does not grant page content or network access.

### `notifications`

Purpose: tell the user when tabs are about to expire or have been auto-deleted.

Primary usage sites:

- `src/lib/background/alarm-notification.ts` — creates expiration and
  auto-delete notifications.
- `src/contexts/saved-tabs/application/ports/NotificationPort.ts` — application
  port abstraction consumed by the saved-tabs feature.

Review notes: notifications are local OS/browser notifications only. No payload
is sent anywhere; the notification text is generated locally.

### `unlimitedStorage`

Purpose: protect the only durable local copy of user data from quota eviction
under Persistence Model v2 (IndexedDB as the source of truth for domain data).

Decision and review notes: this permission was adopted in
[`persistence-durability.md`](persistence-durability.md). TABBIN is local-first
and has no server-side recovery source, so preventing quota eviction of the only
durable copy is part of the data-safety boundary. The permission does not grant
host, network, or user-content access. Chrome does not currently assign an
install warning to `unlimitedStorage`; Firefox grants persistent IndexedDB
access without a database-creation prompt. Every store submission that changes
the permission allowlist must re-check the current Chrome and Firefox review
surfaces.

## Host permissions

### `http://localhost:11434/*` and `http://127.0.0.1:11434/*`

Purpose: connect to the user's own local Ollama service for AI chat. These are
loopback hosts only. They are not remote servers, not LAN hosts, and not cloud
endpoints.

Primary usage sites:

- `src/constants/productionNetworkPolicy.ts` — the typed origin allowlist and
  derived host permission patterns.
- `src/lib/background/ai-chat.ts` — sends the user's prompt, chat history,
  attachments, system instructions, and locally derived saved-tab context to the
  configured local Ollama origin via `ai-sdk-ollama`.

Review notes: the host permission exists solely so the extension can call the
user's local Ollama runtime. The CSP `connect-src` is pinned to the same
origins, so no other outbound destination is permitted from extension pages. See
[`production-network-policy.md`](production-network-policy.md) for the full
outbound network policy and call-site inventory. Adding any non-loopback or
non-Ollama origin is a privacy-design change, not a routine allowlist update.

## Internal persistence invalidation transport

Persistence Model v2 cross-context invalidation uses the internal
`BroadcastChannel` transport documented in
[`persistence-change-invalidation.md`](../architecture/persistence-change-invalidation.md).
The channel `tabbin:persistence-change:v1` is limited by origin to TABBIN's
background/page contexts and carries only a change ID, committed revision, and
allowlisted scopes. It carries no URL, title, note, prompt, attachment, domain,
or other user content. Inbound messages are strictly validated and rejected
diagnostics are redacted.

`BroadcastChannel` is a web-platform API, not an extension API permission. This
transport adds no API permission, host permission, `externally_connectable`,
`web_accessible_resources`, content script, or network surface.

| Security surface                   | Chrome MV3                                 | Firefox MV2                                |
| ---------------------------------- | ------------------------------------------ | ------------------------------------------ |
| Background context                 | Same-extension-origin service worker       | Same-extension-origin background page      |
| Page contexts                      | Same-extension-origin extension pages      | Same-extension-origin extension pages      |
| Protocol payload                   | Identical metadata-only JSON-safe contract | Identical metadata-only JSON-safe contract |
| Added permission / host permission | None                                       | None                                       |
| External, WAR, or network exposure | None                                       | None                                       |

Settings remain on the `chrome.storage.local` control-plane boundary and are
not sent through this persistence invalidation channel.

## Generated manifest security invariants

The verifier `assertManifestMatchesProductionNetworkPolicy` in
`tools/scripts/production-network-policy.ts` runs in
`bun run verify:production-network-policy` against the generated
`.output/chrome-mv3/manifest.json` and `.output/firefox-mv2/manifest.json`. It
checks, per manifest:

- `permissions` matches the approved API permission allowlist exactly (no added,
  missing, or optional permissions).
- `host_permissions` (Chrome MV3) or host patterns inside `permissions`
  (Firefox MV2) matches the approved host permission allowlist exactly.
- `optional_permissions` / `optional_host_permissions` are empty.
- `content_security_policy.extension_pages` matches the production CSP exactly,
  including `connect-src` pinned to the Ollama loopback origins, `object-src`,
  `frame-src`, and `form-action` set to `'none'`, and no unexpected directives.
  This pins `script-src` to `'self'` (Firefox MV2) or `'self' 'wasm-unsafe-eval'`
  (Chrome MV3), so `unsafe-eval`, remote scripts, and inline scripts are
  rejected.
- `externally_connectable` is absent until a trust-boundary review approves
  external message senders.
- `content_scripts` is empty (WXT may emit an empty array) until a trust-boundary
  review approves content-script injection.
- `web_accessible_resources` matches the approved resource-path allowlist in
  `APPROVED_WEB_ACCESSIBLE_RESOURCES` (currently empty). MV2 string arrays and
  MV3 `{ resources, matches }` object arrays are normalized to their resource
  paths and compared exactly against the allowlist, so updating the allowlist
  permits the approved resources. The verifier pins resource paths; the
  `matches` / `extension_ids` exposure scope is part of the security review and
  must be justified in this document before an entry is approved.
- `incognito` is exactly `not_allowed`, keeping private browsing events and data
  outside TABBIN's persistence, backup, analytics, and AI boundaries. The
  authoritative downstream scope is documented in
  [`persistence-model-v2.md`](../architecture/persistence-model-v2.md#incognito-data-boundary).

The `assertChromeFirefoxManifestDelta` verifier checks that Chrome MV3 and
Firefox MV2 differ only on the expected manifest-version-driven structure.
`manifest_version`, `permissions`, `host_permissions`, and
`content_security_policy` differ by manifest version and are verified per
manifest. `action` / `browser_action`, `background`, and
`browser_specific_settings` are normalized to a common representation
(allowed action fields, `service_worker` -> `scripts`, the expected Firefox
gecko data-collection structure) and compared, so an unexpected
browser-specific change inside those keys fails verification instead of being
skipped. The shared `incognito` key must be `not_allowed` on both browsers. Any
other key divergence fails verification, so a change that only lands on one
browser is detected.

## Adding a new permission or privileged surface

Adding a permission, host permission, `content_scripts` entry,
`externally_connectable` surface, or `web_accessible_resources` entry is a
security review, not a routine snapshot update.

1. Update the typed allowlist in `src/constants/extensionPermissions.ts` or
   `src/constants/productionNetworkPolicy.ts` (and
   `APPROVED_WEB_ACCESSIBLE_RESOURCES` in
   `tools/scripts/manifestSecurityInvariants.ts` for web-accessible resources).
2. Add the permission's purpose, usage sites, and review notes to this document.
3. If the addition is `content_scripts`, `externally_connectable`, or
   `onMessageExternal`, complete the trust-boundary review in
   [`messaging-trust-boundary.md`](messaging-trust-boundary.md) first.
4. Run `bun run build && bun run build:firefox && bun run verify:production-network-policy`
   and confirm both manifests and the Chrome/Firefox delta pass.
5. Re-check the current Chrome and Firefox store review surfaces for any new
   permission warning before submission.

A mechanical snapshot update must never bypass these steps. The verifier fails
loudly on any unreviewed privileged surface so the failure is the trigger to
start this checklist.
