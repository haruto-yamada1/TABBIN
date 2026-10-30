# Current storage writer inventory

This inventory records the IndexedDB-only domain contract established by
Issue #861. Saved tabs, projects, categories, AI history, and analytics views
read and write normalized IndexedDB stores directly. Chrome Storage remains
authoritative for settings, selection, theme, and release/UI state.

Legacy domain CRUD, repositories, route selection, Chrome-to-IndexedDB
migration, migration preflight, and migration-dependent cleanup are removed.
Existing old Chrome domain values are neither restored nor physically deleted.
There is no fallback or dual write. IndexedDB schema upgrades and integrity/
Backup V2 recovery remain supported.

## Required storage keys

These are logical data names. Domain entries do not authorize reading or
writing the former Chrome Storage keys.

- `savedTabs`
- `urls`
- `customProjects`
- `parentCategories`
- `userSettings`
- `savedTabsSort:<scope>:<encoded-id>`
- `savedTabsSearchHistory`
- `academyProgressV1`
- `academyWelcomeV1`
- `reviewReminderSettings`
- `reviewReminderNotification`
- `reviewReminderAlarmTimeZone`
- `aiChatConversations`
- `savedAnalyticsViews`

## Writer categories

The category vocabulary remains stable for inventory validation. A category
does not imply that a retired writer still exists.

- explicit mutation
- implicit repair
- normalize-on-read
- self-healing load
- startup migration
- scheduled maintenance
- ui sync
- background listener
- import/restore
- cleanup

## Transaction, readiness, and notification boundaries

Domain operations retain the stable cross-context Web Lock and initialize
IndexedDB through PersistenceBootstrap readiness. Readiness opens the database
and runs supported schema upgrades without reading Chrome migration state.
Snapshot readers decode records and apply blocking integrity checks. Recovery
snapshots remain accessible independently of a full domain integrity scan.

Use-case mutations commit all affected stores in one IndexedDB transaction,
with expected-revision checks for read-modify-write flows. Notifications are
published only after commit and contain allowlisted metadata, not user content.
Settings changes keep their Chrome Storage event path and do not gain a domain
PersistenceChangeScope.

Backup V2 overwrite import validates the current envelope and resource limits,
captures a bounded recovery snapshot, then replaces the logical domain model
transactionally. Settings are written through their dedicated Chrome port.
A failed snapshot capture blocks overwrite; recovery never reads old Chrome
domain records.

## Current writer inventory

Review reminders are opt-in control state independent of auto-delete settings.
Notification metadata stores only the validated filter and reference time, with
no saved URLs or titles. Disabling or changing reminders clears the notification.
This device-local state is outside the Backup V2 domain/settings envelope.
The scheduled alarm stores its timezone so a worker restart after a device
timezone change recalculates the next local review time.

Saved-tabs search history stores at most 50 recently used query strings in the
device-local `savedTabsSearchHistory` key. It contains no result URLs and is
not part of Backup V2 or recovery snapshots. Each entry can be deleted from the
search field. A per-query Web Lock orders delayed saves against deletions of
the same query, and a separate Web Lock serializes storage updates across
extension pages. Storage change events refresh the displayed history.

Academy learning facts use the independent device-local `academyProgressV1`
key. The Academy repository validates its versioned envelope and updates it
under the exclusive `tabbin:academy-progress:v1` Web Lock. Video ranges,
practice completions, lesson skips, and initial-guide dismissals are independent
facts; no saved URL, browser history, or real tab action is stored. A maximum of
256 lesson records and 512 KiB bounds the payload. Unknown valid lesson IDs stay
inert and retained. Invalid or unsupported state is preserved for raw rescue
export, and writes fail closed until explicit recovery or a supported migration.
Academy state stays outside Backup V2, saved-tabs recovery snapshots, and domain
replacement; saved-tabs operations never reset learning progress.

Saved-tabs display sort preferences use one `savedTabsSort:<scope>:<encoded-id>`
Chrome Storage key per category, domain card, or custom project card. Each write
replaces only that preference and never reads or rewrites domain data or
`userSettings`. These device-local preferences are outside Backup V2 and recovery
snapshots, so import and recovery preserve them. Only matching local Chrome
Storage events synchronize the preference across pages; no domain revision or
post-commit notification is involved. Missing, deleted, and invalid values use
the default display order. Preferences persist across reloads, including explicit
returns to the default order; preferences for absent IDs remain inert.

| ID                           | Storage key                                          | Category            | Context            | Entry point                        | Mutation boundary                                                                                                                                                                                        | Read keys                     | Write keys                             | RMW | Queue/lock                           | Cache              | Capacity policy                     | Readiness / recovery gate                    | Change notification                   | v2 target                                                  |
| ---------------------------- | ---------------------------------------------------- | ------------------- | ------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------- | --- | ------------------------------------ | ------------------ | ----------------------------------- | -------------------------------------------- | ------------------------------------- | ---------------------------------------------------------- |
| UI-THEME                     | tab-manager-theme                                    | ui sync             | page               | ThemeProvider.setTheme             | `src/components/ThemeProvider.tsx`                                                                                                                                                                       | theme key                     | theme key                              | No  | None                                 | UI state           | None                                | Settings independent                         | None                                  | Chrome UI                                                  |
| UI-COLOR-RESET               | tab-manager-theme                                    | ui sync             | options            | useColorSettings.handleResetColors | `src/features/options/hooks/useColorSettings.ts`                                                                                                                                                         | userSettings                  | theme key                              | No  | None                                 | React state        | None                                | Settings independent                         | Settings event                        | Chrome UI                                                  |
| UI-ROUTE-CLEANUP             | viewMode                                             | cleanup             | app                | AppRouter bootstrap                | `src/features/navigation/app/AppRouter.tsx`                                                                                                                                                              | None                          | remove viewMode                        | No  | None                                 | URL route          | None                                | Settings independent                         | None                                  | No domain storage                                          |
| UI-SAVED-TABS-SORT           | savedTabsSort:<scope>:<encoded-id>                   | ui sync             | saved-tabs page    | sort preference port               | `src/contexts/saved-tabs/infrastructure/browser/ChromeSavedTabsSortPreferencesAdapter.ts`                                                                                                                | One scoped preference         | One scoped preference                  | No  | Single-key write                     | UI state           | One enum per scope/ID               | Settings independent                         | Chrome onChanged                      | Chrome UI preference                                       |
| UI-SAVED-TABS-SEARCH-HISTORY | savedTabsSearchHistory                               | explicit mutation   | saved-tabs page    | search history port                | `src/contexts/saved-tabs/infrastructure/browser/ChromeSavedTabsSearchHistory.ts`                                                                                                                         | search history key            | search history key                     | Yes | Per-query Web Lock + shared Web Lock | UI state           | Maximum 50 query strings            | Settings independent                         | Chrome onChanged                      | Chrome UI preference; excluded from Backup V2 and recovery |
| RELEASE-CONTROL              | seenVersion / changelogShown                         | background listener | background         | install / update                   | `src/entrypoints/background.ts`                                                                                                                                                                          | release state                 | release state                          | Yes | Background flow                      | None               | None                                | Settings independent                         | None                                  | Chrome release UI                                          |
| SETTINGS-REPAIR              | userSettings                                         | normalize-on-read   | page/background    | getUserSettings                    | `src/lib/storage/settings.ts`                                                                                                                                                                            | userSettings                  | userSettings                           | Yes | Module queue                         | Settings           | None                                | Settings independent                         | Chrome onChanged                      | Chrome settings                                            |
| SETTINGS-SAVE                | userSettings                                         | explicit mutation   | page/background    | saveUserSettings                   | `src/lib/storage/settings.ts`                                                                                                                                                                            | userSettings                  | userSettings                           | Yes | Module queue                         | Settings           | None                                | Settings independent                         | Chrome onChanged                      | Chrome settings                                            |
| SETTINGS-AUTO-DELETE         | userSettings                                         | explicit mutation   | options            | applyAutoDeletePeriod              | `src/features/options/hooks/useAutoDeletePeriod.ts`                                                                                                                                                      | userSettings                  | userSettings                           | Yes | UI confirmation                      | React state        | None                                | Settings independent                         | Chrome onChanged                      | Chrome settings                                            |
| DDD-USER-SETTINGS            | userSettings                                         | explicit mutation   | app/options        | UserSettingsRepository.save        | `src/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeUserSettingsRepository.ts`                                                                                                      | userSettings                  | userSettings                           | No  | Caller                               | None               | None                                | Settings independent                         | Chrome onChanged                      | Chrome settings                                            |
| AI-SELECTION                 | activeAiChatConversationId                           | ui sync             | AI page/background | history replace                    | `src/app/composition/aiConversationHistoryDataPlane.ts`                                                                                                                                                  | selection key                 | selection key                          | No  | After domain commit                  | History store      | None                                | Domain readiness for history                 | Chrome onChanged                      | Chrome UI selection                                        |
| IMPORT-OVERWRITE             | Backup V2 domain/settings                            | import/restore      | options            | ImportBackupV2UseCase              | `src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceReplacementAdapter.ts` / `src/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsExternalDeps.ts` | logical snapshot / settings   | domain stores / settings               | Yes | Web Lock + IDB transaction           | Invalidate queries | Backup resource and capacity limits | IndexedDB readiness/recovery                 | Post-commit metadata + settings event | IndexedDB + Chrome settings                                |
| PERSISTENCE-V2-SAVED-TABS    | savedTabs / urls / customProjects / parentCategories | explicit mutation   | page/background    | saved-tabs commands                | `src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork.ts`                                                                                                        | aggregate stores / revision   | aggregate stores / revision            | Yes | Web Lock + IDB transaction           | Query projections  | Shared capacity contract            | IndexedDB readiness                          | Post-commit saved-tabs scope          | IndexedDB                                                  |
| PERSISTENCE-V2-AI-HISTORY    | aiChatConversations                                  | self-healing load   | AI page/background | conversation replace/repair        | `src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork.ts`                                                                                                        | conversation/message stores   | conversation/message stores / revision | Yes | Web Lock + IDB transaction           | History store      | AI resource limits                  | IndexedDB readiness                          | Post-commit AI-history scope          | IndexedDB                                                  |
| PERSISTENCE-V2-ANALYTICS     | savedAnalyticsViews                                  | explicit mutation   | analytics page     | analytics view replace             | `src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork.ts`                                                                                                        | analytics views / revision    | analytics views / revision             | Yes | Web Lock + IDB transaction           | Query projections  | Backup resource policy              | IndexedDB readiness                          | Post-commit analytics scope           | IndexedDB                                                  |
| PERSISTENCE-V2-RECOVERY      | recoverySnapshots                                    | import/restore      | options            | capture/restore/TTL cleanup        | `src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceRecoverySnapshotRepository.ts`                                                                                        | recovery snapshots / revision | recovery snapshots / revision          | Yes | Web Lock + IDB transaction           | Snapshot list      | Measured payload capacity           | IndexedDB readiness; independent domain scan | Post-commit recovery scope            | IndexedDB                                                  |

| REVIEW-REMINDER-SETTINGS | reviewReminderSettings | explicit mutation | periodic-execution | saveReviewReminderSettings | `src/lib/storage/review-reminders.ts` | reminder settings | reminder settings | No | Explicit save | UI draft | One bounded configuration | Settings independent | Chrome onChanged | Chrome settings |
| REVIEW-REMINDER-NOTIFICATION | reviewReminderNotification | scheduled maintenance | background | save/clearReviewReminderNotification | `src/lib/storage/review-reminders.ts` | reminder metadata | reminder metadata | No | Serialized background flow | None | One filter and reference time | Domain readiness before notification | None | Chrome control state |

| REVIEW-REMINDER-SCHEDULE | reviewReminderAlarmTimeZone | scheduled maintenance | background | saveReviewReminderAlarmTimeZone | `src/lib/storage/review-reminders.ts` | alarm timezone | alarm timezone | No | Serialized background flow | None | One timezone string | Settings independent | None | Chrome control state |

| ACADEMY-WELCOME | academyWelcomeV1 | install / ui sync | background / AppLayout | Academy welcome commands | `src/features/academy/infrastructure/ChromeAcademyWelcomeRepository.ts` | One install eligibility marker | One presentation claim | Yes | Exclusive Web Lock + validated RMW | None | One bounded enum | Only explicit install can arm; claim before showing; no legacy auto-enrollment | Read on app mount | Chrome device-local control state; outside Backup V2 |

| ACADEMY-PROGRESS | academyProgressV1 | explicit mutation | Academy pages | Academy application commands | `src/features/academy/infrastructure/ChromeAcademyProgressRepository.ts` | Academy progress key | Academy progress key | Yes | Exclusive Web Lock + validated RMW | None | 256 lessons / 512 KiB | Strict schema; raw rescue; explicit migration/reset | Read on demand; no domain invalidation | Chrome device-local learning state; outside Backup V2 |

| UI-SAVED-TAB-TITLE | savedTabTitleIndicatorEnabled | ui sync | options/background | setSavedTabTitleEnabled | `src/lib/storage/saved-tab-title-indicator.ts` | One boolean preference | One boolean preference | No | Single-key write | UI state | One boolean | Device-local; explicit user grant before enabling; permission revocation disables | Chrome onChanged | Chrome UI preference; excluded from userSettings, Backup V2 and recovery |

The three IndexedDB mutation files below are shared physical boundaries.
Saved-tabs, AI-history, and analytics writer rows intentionally point to the
same UnitOfWork; their compositions select the appropriate logical changes.
Replacement and recovery snapshot writers have separate transactions.

## Mutation files

- `src/features/academy/infrastructure/ChromeAcademyProgressRepository.ts`
- `src/features/academy/infrastructure/ChromeAcademyWelcomeRepository.ts`
- `src/app/composition/aiConversationHistoryDataPlane.ts`
- `src/components/ThemeProvider.tsx`
- `src/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsExternalDeps.ts`
- `src/contexts/saved-tabs/infrastructure/browser/ChromeSavedTabsSearchHistory.ts`
- `src/contexts/saved-tabs/infrastructure/browser/ChromeSavedTabsSortPreferencesAdapter.ts`
- `src/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeUserSettingsRepository.ts`
- `src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceRecoverySnapshotRepository.ts`
- `src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceReplacementAdapter.ts`
- `src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork.ts`
- `src/entrypoints/background.ts`
- `src/features/navigation/app/AppRouter.tsx`
- `src/features/options/hooks/useAutoDeletePeriod.ts`
- `src/features/options/hooks/useColorSettings.ts`
- `src/lib/storage/settings.ts`
- `src/lib/storage/review-reminders.ts`
- `src/lib/storage/saved-tab-title-indicator.ts`

This appendix and writer table are checked by
`tools/scripts/verify-storage-writer-inventory.ts`. The source detector covers
Chrome Storage set/remove/clear and repository ports, plus IndexedDB object-store
mutation boundaries. New physical writers must appear in both the appendix and
at least one logical writer row. Ordinary Set/Map mutations are not storage
writers.

## Verification

- Current writer IDs are defined in `tools/scripts/storage-writer-inventory-policy.ts`.
- Native saved-tabs command regressions cover persistence across rereads,
  ordering, opening/deleting URLs, category changes, and shared-URL retention.
- AI history and analytics composition tests verify direct IndexedDB access.
- Chrome and Firefox smoke tests cover new installs and existing IndexedDB
  profiles without Chrome migration state.
