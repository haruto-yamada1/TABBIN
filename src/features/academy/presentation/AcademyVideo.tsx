import { useCallback, useRef, useState } from 'react'
import type { ChangeEvent, SyntheticEvent } from 'react'

import { Button } from '@/components/ui/button'
import type {
  LessonAttempt,
  VideoProgressCommand,
} from '@/features/academy/application/ports/AcademyPorts'
import type { Lesson } from '@/features/academy/domain/academySchemas'

import type { AcademyUiUseCases } from './AcademyRoute.types'
import { useAcademyText } from './academyUiMessages'

type CaptionLanguage = 'ja' | 'en' | 'off'
// Well inside the domain's 10-second maximum sample gap. Lifecycle events always report.
const TIMEUPDATE_INTERVAL_MS = 1000
const setCaptionMode = (
  video: HTMLVideoElement | null,
  language: CaptionLanguage,
) => {
  if (!video) {
    return
  }
  for (const track of Array.from(video.textTracks)) {
    track.mode = track.language === language ? 'showing' : 'disabled'
  }
}

export const AcademyVideo = ({
  lesson,
  useCases,
  refresh,
}: {
  lesson: Lesson
  useCases: AcademyUiUseCases
  refresh: () => Promise<void>
}) => {
  const { text, language } = useAcademyText()
  const asset =
    lesson.assets.find(
      (item) => item.locale === language && item.status === 'available',
    ) ?? lesson.assets.find((item) => item.status === 'available')
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [rate, setRate] = useState('1')
  const [captions, setCaptions] = useState<CaptionLanguage>(language)
  const videoRef = useRef<HTMLVideoElement>(null)
  const attempt = useRef<LessonAttempt | null>(null)
  const sequence = useRef(0)
  const sessionId = useRef<string | null>(null)
  const pending = useRef<Promise<void> | null>(null)
  const lastTimeUpdate = useRef<number | null>(null)
  const applyCaptions = useCallback(() => {
    setCaptionMode(videoRef.current, captions)
  }, [captions])
  const handleCaptions = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.currentTarget.value
      if (value !== 'ja' && value !== 'en' && value !== 'off') {
        return
      }
      setCaptions(value)
      setCaptionMode(videoRef.current, value)
    },
    [],
  )
  const report = useCallback(
    (event: SyntheticEvent<HTMLVideoElement>) => {
      if (!asset) {
        return
      }
      if (event.type === 'timeupdate') {
        const now = performance.now()
        if (
          lastTimeUpdate.current !== null &&
          now - lastTimeUpdate.current < TIMEUPDATE_INTERVAL_MS
        ) {
          return
        }
        lastTimeUpdate.current = now
      }
      const video = event.currentTarget
      const sample: Omit<VideoProgressCommand, keyof LessonAttempt> = {
        sessionId: (sessionId.current ??= crypto.randomUUID()),
        sequence: sequence.current++,
        assetId: asset.assetId,
        positionSeconds: Math.min(asset.durationSeconds, video.currentTime),
        playing: !video.paused && !video.ended,
        seeking: video.seeking,
        playbackRate: video.playbackRate,
      }
      const shouldRefresh = video.paused || video.ended
      pending.current = (pending.current ?? Promise.resolve())
        .then(async () => {
          attempt.current ??= await useCases.startLesson(lesson.lessonId)
          await useCases.recordVideoProgress({ ...sample, ...attempt.current })
          if (shouldRefresh) {
            await refresh()
          }
          setSaveFailed(false)
        })
        .catch(() => {
          setSaveFailed(true)
        })
    },
    [asset, lesson.lessonId, refresh, useCases],
  )
  const handleLoad = useCallback(() => {
    setLoaded(true)
  }, [])
  const handleError = useCallback(() => {
    setFailed(true)
  }, [])
  const handleRate = useCallback((event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.currentTarget.value
    setRate(value)
    if (videoRef.current) {
      videoRef.current.playbackRate = Number(value)
    }
  }, [])
  const handleReplay = useCallback(() => {
    const video = videoRef.current
    if (!video) {
      return
    }
    video.pause()
    video.currentTime = 0
    sessionId.current = crypto.randomUUID()
    sequence.current = 0
    lastTimeUpdate.current = null
    void video.play().catch(() => {
      setFailed(true)
    })
  }, [])
  if (!asset) {
    return <p>{text('videoUnavailable')}</p>
  }
  return (
    <div className='space-y-4'>
      <p className='text-sm text-muted-foreground'>{text('videoBrowser')}</p>
      <p className='text-sm text-muted-foreground'>{text('narrationNone')}</p>
      {!loaded ? (
        <div className='space-y-3'>
          <img
            src={asset.posterPath}
            alt={text('videoPoster')}
            className='aspect-video w-full rounded-xl border border-border object-contain'
          />
          <Button type='button' onClick={handleLoad}>
            {text('loadVideo')}
          </Button>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            src={asset.path}
            poster={asset.posterPath}
            controls
            playsInline
            preload='metadata'
            className='aspect-video w-full rounded-xl border border-border bg-black'
            aria-label={text('video')}
            onPlay={report}
            onPause={report}
            onTimeUpdate={report}
            onSeeking={report}
            onSeeked={report}
            onRateChange={report}
            onEnded={report}
            onLoadedMetadata={applyCaptions}
            onError={handleError}
          >
            <track
              kind='captions'
              src={asset.captionPaths?.ja}
              srcLang='ja'
              label='日本語'
              default={language === 'ja'}
            />
            <track
              kind='captions'
              src={asset.captionPaths?.en}
              srcLang='en'
              label='English'
              default={language === 'en'}
            />
            {text('videoFallback')}
          </video>
          <div className='flex flex-wrap items-center gap-4'>
            <label className='space-x-2 text-sm'>
              <span>{text('playbackSpeed')}</span>
              <select
                aria-label={text('playbackSpeed')}
                value={rate}
                onChange={handleRate}
                className='rounded-md border border-border bg-background p-2'
              >
                {['0.5', '0.75', '1', '1.25', '1.5', '2'].map((value) => (
                  <option key={value} value={value}>
                    {value}×
                  </option>
                ))}
              </select>
            </label>
            <label className='space-x-2 text-sm'>
              <span>{text('captions')}</span>
              <select
                aria-label={text('captions')}
                value={captions}
                onChange={handleCaptions}
                className='rounded-md border border-border bg-background p-2'
              >
                <option value='ja'>日本語</option>
                <option value='en'>English</option>
                <option value='off'>{text('captionsOff')}</option>
              </select>
            </label>
            <Button type='button' variant='outline' onClick={handleReplay}>
              {text('replayVideo')}
            </Button>
          </div>
        </>
      )}
      {failed ? <p role='alert'>{text('videoFallback')}</p> : null}
      {saveFailed ? <p role='alert'>{text('actionError')}</p> : null}
    </div>
  )
}
