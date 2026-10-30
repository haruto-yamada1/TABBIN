import type {
  AcademyPorts,
  VideoProgressCommand,
} from '@/features/academy/application/ports/AcademyPorts'
import {
  AcademyCommandError,
  currentAttempt,
  findLesson,
} from '@/features/academy/application/services/AcademyProgressService'
import {
  VIDEO_MAX_SAMPLE_GAP_SECONDS,
  VIDEO_WATCH_THRESHOLD,
} from '@/features/academy/domain/academyProgress'

type Sample = {
  sequence: number
  position: number
  at: number
  playing: boolean
  seeking: boolean
  assetId: string
}
const MILLISECONDS_PER_SECOND = 1000
const POSITION_TIMING_TOLERANCE = 1.05
const MAX_VIDEO_SESSIONS = 32
const isValidReport = (
  command: VideoProgressCommand,
  duration: number,
): boolean =>
  Number.isSafeInteger(command.sequence) &&
  command.sequence >= 0 &&
  Number.isFinite(command.positionSeconds) &&
  command.positionSeconds >= 0 &&
  command.positionSeconds <= duration &&
  typeof command.playing === 'boolean' &&
  typeof command.seeking === 'boolean' &&
  typeof command.sessionId === 'string' &&
  /^[a-zA-Z0-9-]{1,128}$/.test(command.sessionId)

const canCredit = (previous: Sample, next: Sample): boolean => {
  const elapsed = (next.at - previous.at) / MILLISECONDS_PER_SECOND
  const delta = next.position - previous.position
  return (
    previous.assetId === next.assetId &&
    previous.playing &&
    next.playing &&
    !previous.seeking &&
    !next.seeking &&
    next.sequence === previous.sequence + 1 &&
    elapsed > 0 &&
    elapsed <= VIDEO_MAX_SAMPLE_GAP_SECONDS &&
    delta > 0 &&
    delta <= elapsed * POSITION_TIMING_TOLERANCE
  )
}
const mergeRanges = (ranges: [number, number][]): [number, number][] => {
  const merged: [number, number][] = []
  for (const [start, end] of ranges.toSorted(
    (left, right) => left[0] - right[0],
  )) {
    const previous = merged.at(-1)
    if (previous && start <= previous[1]) {
      previous[1] = Math.max(previous[1], end)
    } else {
      merged.push([start, end])
    }
  }
  return merged
}

/** One controller instance per video element. Closing/reopening establishes a fresh baseline. */
export const createRecordVideoProgressUseCase = (ports: AcademyPorts) => {
  const samples = new Map<string, Sample>()
  return async (command: VideoProgressCommand): Promise<void> => {
    const lesson = findLesson(ports, command.lessonId)
    const asset = lesson.assets.find((item) => item.assetId === command.assetId)
    if (asset?.status !== 'available') {
      throw new AcademyCommandError('VIDEO_UNAVAILABLE')
    }
    if (!isValidReport(command, asset.durationSeconds)) {
      throw new AcademyCommandError('INVALID_EVENT')
    }
    const key = JSON.stringify([
      lesson.lessonId,
      command.generation,
      command.sessionId,
    ])
    let accepted: Sample | undefined
    const at = ports.now()
    await ports.repository.update((state) => {
      const progress = currentAttempt(state, lesson, command)
      const previous = samples.get(key)
      if (previous && command.sequence <= previous.sequence) {
        return state
      }
      const next = {
        sequence: command.sequence,
        position: command.positionSeconds,
        at,
        playing: command.playing,
        seeking: command.seeking,
        assetId: asset.assetId,
      }
      accepted = next
      const evidence = progress.video.assets[asset.assetId] ?? {
        durationSeconds: asset.durationSeconds,
        ranges: [],
        watchedAt: null,
      }
      // Position jumps, timer gaps, paused/seeking samples and dropped sequences grant no time.
      if (
        previous &&
        canCredit(previous, next) &&
        (evidence.durationSeconds === null ||
          evidence.durationSeconds === asset.durationSeconds)
      ) {
        evidence.durationSeconds = asset.durationSeconds
        evidence.ranges = mergeRanges([
          ...evidence.ranges,
          [previous.position, next.position],
        ])
        const watched = evidence.ranges.reduce(
          (total, [start, end]) => total + end - start,
          0,
        )
        if (watched / asset.durationSeconds >= VIDEO_WATCH_THRESHOLD) {
          evidence.watchedAt ??= at
        }
        progress.video.assets[asset.assetId] = evidence
      }
      return state
    })
    if (accepted) {
      // Session samples are transient and bounded; persisted evidence consists only of unique ranges.
      if (samples.size >= MAX_VIDEO_SESSIONS && !samples.has(key)) {
        const oldest = samples.keys().next().value
        if (oldest !== undefined) {
          samples.delete(oldest)
        }
      }
      samples.set(key, accepted)
    }
  }
}
