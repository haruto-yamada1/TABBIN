// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { SpeechInput } from './speech-input'

class MockMediaRecorder extends EventTarget {
  static latestInstance: MockMediaRecorder | null = null

  state: RecordingState = 'inactive'
  stream: MediaStream

  constructor(stream: MediaStream) {
    super()
    this.stream = stream
    MockMediaRecorder.latestInstance = this
  }

  start() {
    this.state = 'recording'
  }

  stop() {
    this.state = 'inactive'
    this.dispatchEvent(new Event('stop'))
  }

  emitData(data = new Blob(['audio'])) {
    const event = new Event('dataavailable')

    Object.defineProperty(event, 'data', {
      configurable: true,
      value: data,
    })

    this.dispatchEvent(event as BlobEvent)
  }
}

const originalSpeechRecognition = window.SpeechRecognition
const originalWebkitSpeechRecognition = window.webkitSpeechRecognition
const originalMediaRecorder = globalThis.MediaRecorder
const originalMediaDevices = navigator.mediaDevices

let getUserMediaMock: ReturnType<typeof vi.fn>

const setMediaRecorderMode = () => {
  Reflect.deleteProperty(window, 'SpeechRecognition')
  Reflect.deleteProperty(window, 'webkitSpeechRecognition')
  Object.defineProperty(globalThis, 'MediaRecorder', {
    configurable: true,
    value: MockMediaRecorder,
    writable: true,
  })
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia:
        getUserMediaMock as typeof navigator.mediaDevices.getUserMedia,
    } satisfies Partial<MediaDevices>,
  })
}

const createMockStream = () => {
  const track = {
    stop: vi.fn(),
  } as unknown as MediaStreamTrack
  const stream = {
    getTracks: () => [track],
  } as unknown as MediaStream

  return { stream, track }
}

describe('SpeechInput', () => {
  beforeEach(() => {
    MockMediaRecorder.latestInstance = null
    getUserMediaMock = vi.fn()
    setMediaRecorderMode()
  })

  afterEach(() => {
    cleanup()

    if (originalSpeechRecognition) {
      Object.defineProperty(window, 'SpeechRecognition', {
        configurable: true,
        value: originalSpeechRecognition,
      })
    } else {
      Reflect.deleteProperty(window, 'SpeechRecognition')
    }

    if (originalWebkitSpeechRecognition) {
      Object.defineProperty(window, 'webkitSpeechRecognition', {
        configurable: true,
        value: originalWebkitSpeechRecognition,
      })
    } else {
      Reflect.deleteProperty(window, 'webkitSpeechRecognition')
    }

    Object.defineProperty(globalThis, 'MediaRecorder', {
      configurable: true,
      value: originalMediaRecorder,
      writable: true,
    })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    })
  })

  it('unmount 時に MediaRecorder listener を除去して track を停止する', async () => {
    const { stream, track } = createMockStream()
    const onAudioRecorded = vi.fn().mockResolvedValue('transcribed')

    getUserMediaMock.mockResolvedValue(stream)

    const { unmount } = render(
      <SpeechInput onAudioRecorded={onAudioRecorded} />,
    )

    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(MockMediaRecorder.latestInstance).toBeInstanceOf(MockMediaRecorder)
    })

// eslint-disable-next-line typescript/non-nullable-type-assertion-style
    const recorder = MockMediaRecorder.latestInstance as MockMediaRecorder
    using removeEventListenerSpy = vi.spyOn(recorder, 'removeEventListener')
    using stopSpy = vi.spyOn(recorder, 'stop')

    unmount()

    expect(stopSpy).toHaveBeenCalledTimes(1)
// eslint-disable-next-line typescript/unbound-method
    expect(track.stop).toHaveBeenCalledTimes(1)
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'dataavailable',
      expect.any(Function),
    )
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'stop',
      expect.any(Function),
    )
    expect(removeEventListenerSpy).toHaveBeenCalledWith(
      'error',
      expect.any(Function),
    )
    expect(onAudioRecorded).not.toHaveBeenCalled()
  })

  it('getUserMedia が拒否されたときに permission error を表示する', async () => {
    getUserMediaMock.mockRejectedValue(
      new DOMException('Permission denied', 'NotAllowedError'),
    )

    render(<SpeechInput onAudioRecorded={vi.fn()} />)

    fireEvent.click(screen.getByRole('button'))

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Microphone access was denied. Allow microphone access and try again.',
    )
  })

  it('録音後の文字起こし失敗をユーザーへ表示する', async () => {
    const { stream } = createMockStream()
// eslint-disable-next-line typescript/require-await
    const onAudioRecorded = vi.fn(async (_audioBlob: Blob) => {
      throw new Error('transcription failed')
    })

    getUserMediaMock.mockResolvedValue(stream)

    render(<SpeechInput onAudioRecorded={onAudioRecorded} />)

    const button = screen.getByRole('button')

    fireEvent.click(button)

    await waitFor(() => {
      expect(MockMediaRecorder.latestInstance).toBeInstanceOf(MockMediaRecorder)
    })

// eslint-disable-next-line typescript/non-nullable-type-assertion-style
    ;(MockMediaRecorder.latestInstance as MockMediaRecorder).emitData()
    fireEvent.click(button)

    await waitFor(() => {
      expect(onAudioRecorded).toHaveBeenCalledTimes(1)
    })
    expect((await screen.findByRole('alert')).textContent).toContain(
      'transcription failed',
    )
  })
})
