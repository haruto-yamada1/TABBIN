'use client'

import { MicIcon, SquareIcon } from 'lucide-react'
import type { ComponentProps } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

interface SpeechRecognition extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null
  onend: ((this: SpeechRecognition, ev: Event) => void) | null
  onresult:
    | ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void)
    | null
  onerror:
    | ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void)
    | null
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList
  resultIndex: number
}

interface SpeechRecognitionResultList {
  readonly length: number
  item(index: number): SpeechRecognitionResult
  [index: number]: SpeechRecognitionResult
}

interface SpeechRecognitionResult {
  readonly length: number
  item(index: number): SpeechRecognitionAlternative
  [index: number]: SpeechRecognitionAlternative
  isFinal: boolean
}

interface SpeechRecognitionAlternative {
  transcript: string
  confidence: number
}

const PERMISSION_DENIED_MESSAGE =
  'Microphone access was denied. Allow microphone access and try again.'
const RECORDING_START_FAILED_MESSAGE =
  'Unable to start recording. Please try again.'
const RECORDING_PROCESS_FAILED_MESSAGE =
  'Unable to process the recorded audio. Please try again.'
const RECORDING_FAILED_MESSAGE = 'Recording failed. Please try again.'

const stopStreamTracks = (stream: MediaStream | null) => {
  if (!stream) {
    return
  }

  for (const track of stream.getTracks()) {
    track.stop()
  }
}

const getRecordingErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return PERMISSION_DENIED_MESSAGE
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string
}

const pulseRings = [
  { delay: '0s', id: 'pulse-ring-0' },
  { delay: '0.3s', id: 'pulse-ring-1' },
  { delay: '0.6s', id: 'pulse-ring-2' },
]

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition
    webkitSpeechRecognition: new () => SpeechRecognition
  }
}

type SpeechInputMode = 'speech-recognition' | 'media-recorder' | 'none'

export type SpeechInputProps = ComponentProps<typeof Button> & {
  onTranscriptionChange?: (text: string) => void
  /**
   * Callback for when audio is recorded using MediaRecorder fallback.
   * This is called in browsers that don't support the Web Speech API (Firefox, Safari).
   * The callback receives an audio Blob that should be sent to a transcription service.
   * Return the transcribed text, which will be passed to onTranscriptionChange.
   */
  onAudioRecorded?: (audioBlob: Blob) => Promise<string>
  lang?: string
}

const detectSpeechInputMode = (): SpeechInputMode => {
  if (typeof window === 'undefined') {
    return 'none'
  }

  if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
    return 'speech-recognition'
  }

  if ('MediaRecorder' in window && 'mediaDevices' in navigator) {
    return 'media-recorder'
  }

  return 'none'
}

export const SpeechInput = ({
  className,
  onTranscriptionChange,
  onAudioRecorded,
  lang = 'en-US',
  ...props
}: SpeechInputProps) => {
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [mode] = useState<SpeechInputMode>(detectSpeechInputMode)
  const [isRecognitionReady, setIsRecognitionReady] = useState(false)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const mediaRecorderCleanupRef = useRef<(() => void) | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const isMountedRef = useRef(true)
  const onTranscriptionChangeRef = useRef<
    SpeechInputProps['onTranscriptionChange']
  >(onTranscriptionChange)
  const onAudioRecordedRef =
    useRef<SpeechInputProps['onAudioRecorded']>(onAudioRecorded)

  // Keep refs in sync
  onTranscriptionChangeRef.current = onTranscriptionChange
  onAudioRecordedRef.current = onAudioRecorded

  const handleSpeechRecognitionStart = useCallback(() => {
    setIsListening(true)
  }, [])

  const handleSpeechRecognitionEnd = useCallback(() => {
    setIsListening(false)
  }, [])

  const handleSpeechRecognitionResult = useCallback((event: Event) => {
    const speechEvent = event as SpeechRecognitionEvent
    let finalTranscript = ''

    for (
      let i = speechEvent.resultIndex;
      i < speechEvent.results.length;
      i += 1
    ) {
      const result = speechEvent.results[i]
      if (result.isFinal) {
        finalTranscript += result[0]?.transcript ?? ''
      }
    }

    if (finalTranscript) {
      onTranscriptionChangeRef.current?.(finalTranscript)
    }
  }, [])

  const handleSpeechRecognitionError = useCallback(() => {
    setIsListening(false)
  }, [])
  const handleSpeechRecognitionStartRef = useRef(handleSpeechRecognitionStart)
  const handleSpeechRecognitionEndRef = useRef(handleSpeechRecognitionEnd)
  const handleSpeechRecognitionResultRef = useRef(handleSpeechRecognitionResult)
  const handleSpeechRecognitionErrorRef = useRef(handleSpeechRecognitionError)

  handleSpeechRecognitionStartRef.current = handleSpeechRecognitionStart
  handleSpeechRecognitionEndRef.current = handleSpeechRecognitionEnd
  handleSpeechRecognitionResultRef.current = handleSpeechRecognitionResult
  handleSpeechRecognitionErrorRef.current = handleSpeechRecognitionError

  const cleanupMediaRecorderSession = useCallback(
    (mediaRecorder?: MediaRecorder | null, stream?: MediaStream | null) => {
      mediaRecorderCleanupRef.current?.()
      mediaRecorderCleanupRef.current = null

      if (!mediaRecorder || mediaRecorderRef.current === mediaRecorder) {
        mediaRecorderRef.current = null
      }

      if (!stream || streamRef.current === stream) {
        streamRef.current = null
      }
    },
    [],
  )

  // Initialize Speech Recognition when mode is speech-recognition
  useEffect(() => {
    if (mode !== 'speech-recognition') {
      return
    }

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition
    const speechRecognition = new SpeechRecognition()

    speechRecognition.continuous = true
    speechRecognition.interimResults = true
    speechRecognition.lang = lang

    const handleStart = () => handleSpeechRecognitionStartRef.current()
    const handleEnd = () => handleSpeechRecognitionEndRef.current()
    const handleResult = (event: Event) =>
      handleSpeechRecognitionResultRef.current(event)
    const handleError = () => handleSpeechRecognitionErrorRef.current()

    speechRecognition.addEventListener('start', handleStart)
    speechRecognition.addEventListener('end', handleEnd)
    speechRecognition.addEventListener('result', handleResult)
    speechRecognition.addEventListener('error', handleError)

    recognitionRef.current = speechRecognition
    setIsRecognitionReady(true)

    return () => {
      speechRecognition.removeEventListener('start', handleStart)
      speechRecognition.removeEventListener('end', handleEnd)
      speechRecognition.removeEventListener('result', handleResult)
      speechRecognition.removeEventListener('error', handleError)
      speechRecognition.stop()
      recognitionRef.current = null
      setIsRecognitionReady(false)
    }
  }, [mode, lang])

  // Cleanup MediaRecorder and stream on unmount
  useEffect(
    () => () => {
      isMountedRef.current = false
      const mediaRecorder = mediaRecorderRef.current
      const stream = streamRef.current

      cleanupMediaRecorderSession(mediaRecorder, stream)

      if (mediaRecorder?.state === 'recording') {
        mediaRecorder.stop()
      }

      mediaRecorderRef.current = null
      stopStreamTracks(stream)
      streamRef.current = null
      audioChunksRef.current = []
    },
    [cleanupMediaRecorderSession],
  )

  // Start MediaRecorder recording
  const startMediaRecorder = useCallback(async () => {
    if (!onAudioRecordedRef.current) {
      return
    }

    setErrorMessage(null)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mediaRecorder = new MediaRecorder(stream)
      audioChunksRef.current = []

      const handleDataAvailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      const handleStop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: 'audio/webm',
        })

        cleanupMediaRecorderSession(mediaRecorder, stream)
        stopStreamTracks(stream)

        if (
          audioBlob.size > 0 &&
          onAudioRecordedRef.current &&
          isMountedRef.current
        ) {
          setIsProcessing(true)
          try {
            const transcript = await onAudioRecordedRef.current(audioBlob)
            if (transcript && isMountedRef.current) {
              onTranscriptionChangeRef.current?.(transcript)
            }
          } catch (error) {
            if (isMountedRef.current) {
              setErrorMessage(
                getRecordingErrorMessage(
                  error,
                  RECORDING_PROCESS_FAILED_MESSAGE,
                ),
              )
            }
          } finally {
            audioChunksRef.current = []

            if (isMountedRef.current) {
              setIsProcessing(false)
            }
          }
        } else {
          audioChunksRef.current = []
        }
      }

      const handleError = () => {
        cleanupMediaRecorderSession(mediaRecorder, stream)
        stopStreamTracks(stream)
        audioChunksRef.current = []
        setIsListening(false)
        setErrorMessage(RECORDING_FAILED_MESSAGE)
      }

      mediaRecorder.addEventListener('dataavailable', handleDataAvailable)
      mediaRecorder.addEventListener('stop', handleStop)
      mediaRecorder.addEventListener('error', handleError)
      mediaRecorderCleanupRef.current = () => {
        mediaRecorder.removeEventListener('dataavailable', handleDataAvailable)
        mediaRecorder.removeEventListener('stop', handleStop)
        mediaRecorder.removeEventListener('error', handleError)
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setIsListening(true)
    } catch (error) {
      const stream = streamRef.current

      cleanupMediaRecorderSession(mediaRecorderRef.current, stream)
      stopStreamTracks(stream)
      streamRef.current = null
      setIsListening(false)
      setErrorMessage(
        getRecordingErrorMessage(error, RECORDING_START_FAILED_MESSAGE),
      )
    }
  }, [cleanupMediaRecorderSession])

  // Stop MediaRecorder recording
  const stopMediaRecorder = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop()
    }
    setIsListening(false)
  }, [])

  const toggleListening = useCallback(() => {
    if (mode === 'speech-recognition' && recognitionRef.current) {
      if (isListening) {
        recognitionRef.current.stop()
      } else {
        recognitionRef.current.start()
      }
    } else if (mode === 'media-recorder') {
      if (isListening) {
        stopMediaRecorder()
      } else {
        startMediaRecorder()
      }
    }
  }, [mode, isListening, startMediaRecorder, stopMediaRecorder])

  // Determine if button should be disabled
  const isDisabled =
    mode === 'none' ||
    (mode === 'speech-recognition' && !isRecognitionReady) ||
    (mode === 'media-recorder' && !onAudioRecorded) ||
    isProcessing

  return (
    <div className='inline-flex flex-col items-center gap-2'>
      <div className='relative inline-flex items-center justify-center'>
        {/* Animated pulse rings */}
        {isListening &&
          pulseRings.map(({ delay, id }) => (
            <div
              className='absolute inset-0 animate-ping rounded-full border-2 border-red-400/30'
              key={id}
              style={{
                animationDelay: delay,
                animationDuration: '900ms',
              }}
            />
          ))}

        {/* Main record button */}
        <Button
          className={cn(
            'relative z-10 rounded-full transition-all duration-300',
            isListening
              ? 'bg-destructive text-white hover:bg-destructive/80 hover:text-white'
              : 'bg-primary text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground',
            className,
          )}
          disabled={isDisabled}
          onClick={toggleListening}
          {...props}
        >
          {isProcessing && <Spinner />}
          {!isProcessing && isListening && <SquareIcon className='size-4' />}
          {!(isProcessing || isListening) && <MicIcon className='size-4' />}
        </Button>
      </div>

      {errorMessage && (
        <Alert className='max-w-80' variant='destructive'>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
