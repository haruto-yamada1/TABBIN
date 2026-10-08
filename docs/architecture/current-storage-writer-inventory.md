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

| ID                        | Storage key                                          | Category            | Context            | Entry point                        | Mutation boundary                                                                                                                                                                                        | Read keys                     | Write keys                             | RMW | Queue/lock                 | Cache              | Capacity policy                     | Readiness / recovery gate                    | Change notification                   | v2 target                   |
| ------------------------- | ---------------------------------------------------- | ------------------- | ------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------- | --- | -------------------------- | ------------------ | ----------------------------------- | -------------------------------------------- | ------------------------------------- | --------------------------- |
| UI-THEME                  | tab-manager-theme                                    | ui sync             | page               | ThemeProvider.setTheme             | `src/components/ThemeProvider.tsx`                                                                                                                                                                       | theme key                     | theme key                              | No  | None                       | UI state           | None                                | Settings independent                         | None                                  | Chrome UI                   |
| UI-COLOR-RESET            | tab-manager-theme                                    | ui sync             | options            | useColorSettings.handleResetColors | `src/features/options/hooks/useColorSettings.ts`                                                                                                                                                         | userSettings                  | theme key                              | No  | None                       | React state        | None                                | Settings independent                         | Settings event                        | Chrome UI                   |
| UI-ROUTE-CLEANUP          | viewMode                                             | cleanup             | app                | AppRouter bootstrap                | `src/features/navigation/app/AppRouter.tsx`                                                                                                                                                              | None                          | remove viewMode                        | No  | None                       | URL route          | None                                | Settings independent                         | None                                  | No domain storage           |
| RELEASE-CONTROL           | seenVersion / changelogShown                         | background listener | background         | install / update                   | `src/entrypoints/background.ts`                                                                                                                                                                          | release state                 | release state                          | Yes | Background flow            | None               | None                                | Settings independent                         | None                                  | Chrome release UI           |
| SETTINGS-REPAIR           | userSettings                                         | normalize-on-read   | page/background    | getUserSettings                    | `src/lib/storage/settings.ts`                                                                                                                                                                            | userSettings                  | userSettings                           | Yes | Module queue               | Settings           | None                                | Settings independent                         | Chrome onChanged                      | Chrome settings             |
| SETTINGS-SAVE             | userSettings                                         | explicit mutation   | page/background    | saveUserSettings                   | `src/lib/storage/settings.ts`                                                                                                                                                                            | userSettings                  | userSettings                           | Yes | Module queue               | Settings           | None                                | Settings independent                         | Chrome onChanged                      | Chrome settings             |
| SETTINGS-AUTO-DELETE      | userSettings                                         | explicit mutation   | options            | applyAutoDeletePeriod              | `src/features/options/hooks/useAutoDeletePeriod.ts`                                                                                                                                                      | userSettings                  | userSettings                           | Yes | UI confirmation            | React state        | None                                | Settings independent                         | Chrome onChanged                      | Chrome settings             |
| DDD-USER-SETTINGS         | userSettings                                         | explicit mutation   | app/options        | UserSettingsRepository.save        | `src/contexts/saved-tabs/infrastructure/persistence/chrome-storage/ChromeUserSettingsRepository.ts`                                                                                                      | userSettings                  | userSettings                           | No  | Caller                     | None               | None                                | Settings independent                         | Chrome onChanged                      | Chrome settings             |
| AI-SELECTION              | activeAiChatConversationId                           | ui sync             | AI page/background | history replace                    | `src/app/composition/aiConversationHistoryDataPlane.ts`                                                                                                                                                  | selection key                 | selection key                          | No  | After domain commit        | History store      | None                                | Domain readiness for history                 | Chrome onChanged                      | Chrome UI selection         |
| IMPORT-OVERWRITE          | Backup V2 domain/settings                            | import/restore      | options            | ImportBackupV2UseCase              | `src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceReplacementAdapter.ts` / `src/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsExternalDeps.ts` | logical snapshot / settings   | domain stores / settings               | Yes | Web Lock + IDB transaction | Invalidate queries | Backup resource and capacity limits | IndexedDB readiness/recovery                 | Post-commit metadata + settings event | IndexedDB + Chrome settings |
| PERSISTENCE-V2-SAVED-TABS | savedTabs / urls / customProjects / parentCategories | explicit mutation   | page/background    | saved-tabs commands                | `src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork.ts`                                                                                                        | aggregate stores / revision   | aggregate stores / revision            | Yes | Web Lock + IDB transaction | Query projections  | Shared capacity contract            | IndexedDB readiness                          | Post-commit saved-tabs scope          | IndexedDB                   |
| PERSISTENCE-V2-AI-HISTORY | aiChatConversations                                  | self-healing load   | AI page/background | conversation replace/repair        | `src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork.ts`                                                                                                        | conversation/message stores   | conversation/message stores / revision | Yes | Web Lock + IDB transaction | History store      | AI resource limits                  | IndexedDB readiness                          | Post-commit AI-history scope          | IndexedDB                   |
| PERSISTENCE-V2-ANALYTICS  | savedAnalyticsViews                                  | explicit mutation   | analytics page     | analytics view replace             | `src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceUnitOfWork.ts`                                                                                                        | analytics views / revision    | analytics views / revision             | Yes | Web Lock + IDB transaction | Query projections  | Backup resource policy              | IndexedDB readiness                          | Post-commit analytics scope           | IndexedDB                   |
| PERSISTENCE-V2-RECOVERY   | recoverySnapshots                                    | import/restore      | options            | capture/restore/TTL cleanup        | `src/contexts/saved-tabs/infrastructure/persistence/indexed-db/IndexedDbPersistenceRecoverySnapshotRepository.ts`                                                                                        | recovery snapshots / revision | recovery snapshots / revision          | Yes | Web Lock + IDB transaction | Snapshot list      | Measured payload capacity           | IndexedDB readiness; independent domain scan | Post-commit recovery scope            | IndexedDB                   |

| REVIEW-REMINDER-SETTINGS | reviewReminderSettings | explicit mutation | periodic-execution | saveReviewReminderSettings | `src/lib/storage/review-reminders.ts` | reminder settings | reminder settings | No | Explicit save | UI draft | One bounded configuration | Settings independent | Chrome onChanged | Chrome settings |
| REVIEW-REMINDER-NOTIFICATION | reviewReminderNotification | scheduled maintenance | background | save/clearReviewReminderNotification | `src/lib/storage/review-reminders.ts` | reminder metadata | reminder metadata | No | Serialized background flow | None | One filter and reference time | Domain readiness before notification | None | Chrome control state |

| REVIEW-REMINDER-SCHEDULE | reviewReminderAlarmTimeZone | scheduled maintenance | background | saveReviewReminderAlarmTimeZone | `src/lib/storage/review-reminders.ts` | alarm timezone | alarm timezone | No | Serialized background flow | None | One timezone string | Settings independent | None | Chrome control state |

The three IndexedDB mutation files below are shared physical boundaries.
Saved-tabs, AI-history, and analytics writer rows intentionally point to the
same UnitOfWork; their compositions select the appropriate logical changes.
Replacement and recovery snapshot writers have separate transactions.

## Mutation files

- `src/app/composition/aiConversationHistoryDataPlane.ts`
- `src/components/ThemeProvider.tsx`
- `src/contexts/saved-tabs/infrastructure/composition/createIndexedDbSavedTabsExternalDeps.ts`
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
