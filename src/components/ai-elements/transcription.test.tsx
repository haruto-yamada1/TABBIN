// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { Transcription, TranscriptionSegment } from './transcription'

describe('Transcription', () => {
  it('render prop から返した segment 一覧で key warning を出さない', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <Transcription
        currentTime={1}
        onSeek={() => undefined}
        segments={
          [
            { endSecond: 1, startSecond: 0, text: 'First segment' },
            { endSecond: 2, startSecond: 1, text: 'Second segment' },
          ] as never
        }
      >
        {(segment, index) => (
          <TranscriptionSegment index={index} segment={segment} />
        )}
      </Transcription>,
    )

    expect(screen.getByText('First segment')).toBeTruthy()
    expect(screen.getByText('Second segment')).toBeTruthy()
    expect(errorSpy).not.toHaveBeenCalled()

    errorSpy.mockRestore()
  })
})
