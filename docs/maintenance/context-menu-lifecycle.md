# Context menu lifecycle

`background.ts` registers `registerContextMenuClickListener()` synchronously,
before starting menu reconciliation or IndexedDB bootstrap. The callback keeps
the existing action IDs and active-tab semantics: the clicked `tab` argument is
intentionally not forwarded to the save handlers.

`reconcileContextMenus()` serializes browser API writes. It updates each stable
ID and creates it when updating fails. Chrome has no menu enumeration API; a
duplicate create error is consumed and logged safely, rather than creating an
alternative ID. A later reconciliation retries partial failures. Translation,
removal, update and create failures cannot prevent click registration.

Normal worker starts update the six desired items without `removeAll()`. This
preserves Chrome MV3 menus across worker wakes and also supplies missing items
when Firefox's persistent MV2 background starts. Install/update events reset
the definitions to remove obsolete IDs. Local `userSettings.language` changes
update titles without clearing the menus. Browser UI locale changes take
effect on the next background start, including browser restart. No lifecycle
marker or new storage schema is required.

## Browser evidence (2026-11-10)

- The two pending-callback/translation regression tests failed before the fix:
  the click listener had zero registrations. The final unit tests also cover
  duplicate initialization, all five actions, ignored IDs, API absence,
  callback `runtime.lastError`, synchronous throws and recovery.
- Chromium production extension E2E stops the real worker using CDP, waits for
  `runningStatus: stopped`, wakes it through an extension message and verifies
  a fresh execution realm. All six menu IDs and an independent sentinel survive
  the wake; a deliberately removed action is recreated. The sentinel detects
  unintended `removeAll()` on wake. This test does not simulate a context click.
- A separate isolated, headful Chromium profile used the unmodified production
  artifact and a fictional loopback page. After CDP confirmed the worker was
  stopped, the native right-click menu displayed five actions and a separator.
  Selecting **Save current tab** through computer use woke a fresh worker,
  closed the target tab and committed its URL/title to IndexedDB. **Open saved
  tabs** showed the saved row. Changing settings from English to Japanese
  updated the native menu titles without reloading the extension.

- Firefox 157.0 production artifact: a WebDriver right-click generated the real
  XUL context menu. All six entries appeared in English, changed to Japanese
  after a settings update, and remained after an add-on reload replaced the
  background realm. Native `menupopup.activateItem()` reached the real
  `contextMenus.onClicked` event. This is native browser automation, not a
  physical OS mouse-input test.
- Firefox **Save current tab** did not complete. An independent archive of
  unchanged `develop` (`94240c28`) reproduced the same native click reaching
  `onClicked` while Saved Tabs remained empty. A separate diagnostic bundle
  calling the unchanged save handler returned
  `TabFilteringError(reason: evaluation-failed)`. In that Firefox runtime,
  raw `chrome.tabs.query()` returned `undefined`, while `browser.tabs.query()`
  returned a Promise. `extension-actions.ts` is unchanged by this fix and has
  the same blob hash on both branches. This existing save-handler API
  compatibility issue is follow-up work; Firefox saving is not claimed as
  successfully verified here.
- Install/update reset behavior is covered by background-entrypoint unit tests;
  the native Firefox reload checks recreation. A packaged store-version update
  and a full OS/browser restart were not exercised. Chromium's real worker
  stop/wake was exercised separately as described above.

Chrome's synchronous subscription requirement is documented in
[Events in service workers](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/events).
[MDN menus.create](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/menus/create)
explains the persistence difference between persistent background pages and
non-persistent backgrounds. Firefox MV2 remains a supported target; it must not
be assumed to share Chrome's menu persistence.
