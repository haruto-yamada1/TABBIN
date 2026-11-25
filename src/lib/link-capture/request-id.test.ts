import { afterEach, describe, expect, it, vi } from 'vitest'

import { linkCaptureMessageSchema } from '@/types/link-capture'

import { createCaptureRequestId } from './request-id'

describe('capture request identifiers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it.each([
    [0, '00000000-0000-4000-8000-000000000000'],
    [255, 'ffffffff-ffff-4fff-bfff-ffffffffffff'],
  ])(
    'preserves random bytes %i and sets UUID v4 version and variant bits',
    (byte, expected) => {
      const getRandomValues = vi.fn((bytes: Uint8Array) => bytes.fill(byte))
      vi.stubGlobal('crypto', { getRandomValues })
      const requestId = createCaptureRequestId()
      expect(requestId).toBe(expected)
      expect(getRandomValues).toHaveBeenCalledOnce()
      expect(getRandomValues.mock.calls[0]?.[0]).toHaveLength(16)
      expect(
        linkCaptureMessageSchema.safeParse({
          action: 'previewLinkCapture',
          requestId,
          links: [],
        }).success,
      ).toBe(true)
    },
  )

  it('propagates a secure randomness failure without manufacturing an identifier', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: () => {
        throw new Error('secure randomness unavailable')
      },
    })
    expect(createCaptureRequestId).toThrow('secure randomness unavailable')
  })
})
