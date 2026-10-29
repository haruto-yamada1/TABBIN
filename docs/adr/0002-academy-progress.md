# Academy curriculum and local progress

- Status: accepted for Issue #996
- Scope: Academy domain/application/persistence foundation; UI, videos, recorder,
  sandbox and Joyride integration are subsequent issues in Epic #919.

## Decision and ownership

Use `src/features/academy/{domain,application,infrastructure}` with the dependency
rules in `docs/architecture/ddd.md`. The initial catalog is the common source of
stable course, lesson and step IDs, prerequisite relationships, localized text
keys, `data-tour` names, planned local asset paths and success requirements.
UI, renderers and recorders consume this catalog; they must not copy a second
scenario list. Static Custom-mode and backup supplements belong to the subsequent Academy
UI/material issues.
The `academy-*` data-tour values declare future UI targets; the attributes and
video files are supplied by the dependent UI/material issues. Planned assets
must not be presented as playable media.

Progress uses the existing Promise-aware browser storage wrapper and a dedicated
`academyProgressV1` key in `storage.local`. Learning is small, device-local UI
state, independent of normalized saved URLs, settings, Backup V2 and saved-tab
recovery snapshots. It must remain readable when the saved-tabs database needs
recovery. Extending the saved-tabs IndexedDB schema would couple two recovery
lifecycles without a relational or transactional requirement. No authentication,
network request, analytics event or extension permission is added.

Presentation calls application use-cases constructed by
`src/app/composition/createAcademyUseCases.ts`; it never writes storage. The
repository owns strict decoding, bounded capacity (256 lessons / 512 KiB), and
exclusive Web Lock `tabbin:academy-progress:v1`. Every mutation re-reads inside
the lock, validates, applies one command, validates again, and awaits the write.
Missing/rejected coordination fails closed. There is no stale in-memory state
cache: consumers re-query on re-entry or after storage-change invalidation.
Future UI listeners must treat notifications as hints and read the current DTO.

## Independent evidence and mastery

Start time, lesson skip, watched-video ranges/timestamp and per-step practice
success timestamps are independent facts. Intro dismissal/skip is separate from
all lessons. The DTO derives `notStarted`, `inProgress`, `videoWatched`,
`practiceCompleted`, `mastered` and `relearning`; no single ordered status is
persisted. A skipped lesson can later become mastered without deleting the skip
fact. Only explicit reset removes progress; reset preserves intro decisions.

A video-only lesson requires video evidence. A practice lesson requires every
listed sandbox success. A lesson requiring both must satisfy both. No empty
requirement set is mastered. Prerequisites describe the recommended learning
order and are exposed as `prerequisitesMet`; they do not lock lesson access,
including while an earlier video is still planned. The current lesson catalog, rather than stored IDs,
determines aggregation's denominator. Removed/unknown stored IDs are retained
but excluded from current counts; ordering does not alter counts.

Practice completion is an application command for a validated action and step
in `academy-sandbox`. The future sandbox command handler must call it only after
its operation succeeds; clicking Next is not an achievement. The application
imports no saved-tabs write API, browser tabs API or browsing-history API. These
commands store only stable identifiers and timestamps, never user URLs/content.

## Playback policy

`VIDEO_WATCH_THRESHOLD = 0.9` counts the union of played intervals, avoiding
credit for replaying the same interval. Each video element owns one recorder
instance and a unique session ID. Reports have monotonically increasing sequence
numbers, asset ID, current position, playing and seeking flags. Both ends must
be actively playing, consecutive, non-seeking, and on the same available asset.
Position delta may not exceed measured elapsed time (5% timing tolerance), and
sample gaps over 10 seconds earn no credit. This policy currently credits 1x
playback. A report every 1–5 seconds is suitable. Faster playback support requires
an explicit policy change and tests rather than trusting a supplied rate.

The first report establishes a baseline. Pause, seek, hiding/suspending timers,
closing the screen or destroying its controller does not manufacture playback
credit. A new controller after re-entry starts a fresh baseline and continues
from persisted unique ranges. Duplicates/out-of-order reports add nothing. A
missing/planned video cannot record viewing or satisfy a video requirement.
This is local learning feedback, not tamper-resistant certification.

## Version changes, reset and recovery

`contentVersion` tracks compatible copy/assets/order changes. An unchanged
`assessmentVersion` retains achievements, generation and resume state. Bump
`assessmentVersion` when successful actions, required steps or video evidence
semantics change incompatibly. Old evidence remains visible as `relearning`,
but does not count as current mastery. Starting/recording with old criteria is
rejected as `RELEARNING_REQUIRED`. The UI must explain that an explicit lesson
reset starts a new attempt; this deliberate restart discards that lesson's old
evidence. Nothing resets merely because the extension is updated.

Each attempt has a fresh generation. Commands from a reset/obsolete attempt
fail as `STALE_ATTEMPT`; retries and duplicate completion events preserve their
original timestamps. Intro actions are idempotent and never reset lessons.
Reset-all affects Academy lessons only. Reset is never invoked on mount/update.

The envelope schema version is separate from content/assessment versions.
Malformed data, mismatched IDs, unsafe keys, oversized records and unsupported
future schemas fail without overwriting any bytes. `exportRawProgress` remains
available for local rescue/inspection even if normal decoding fails; this is not
a Backup V2 file and must not be imported as one. I/O errors return safe typed
codes without raw user content and permit retry after the storage problem is
resolved. Reads do not repair. A future incompatible schema requires a tested,
explicit migration preserving the previous envelope before replacement; older
versions refuse to downgrade it. A destructive recovery/reset of corrupt data
requires explicit user action after rescue; the current adapter intentionally
provides no automatic corrupt-state overwrite path.

## Verification and rollback

Unit tests cover definition validation, interrupted/repeated events, missing
assets, seek/pause, restart/revisit, unknown IDs, aggregation and criteria updates.
The extension E2E closes Chromium and relaunches the same temporary profile,
updates from independent tabs and compares saved-tab stores before/after.
The same Academy smoke is included in the existing native Firefox restart
harness. Its environment preflight must pass before claiming Firefox evidence.

The feature has no user-facing route or automatic startup mutation yet. Removing
its composition callers leaves the local key intact. Downgrades preserve
unrecognized envelopes. Saved tabs and Backup V2 require no migration or rollback.
