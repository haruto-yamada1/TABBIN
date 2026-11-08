import { describe, expect, it } from 'vitest'

import { createMediaResponse } from './mediaResponse'

const file = Buffer.from('0123456789')
describe('local playback media responses', () => {
  it('serves the complete immutable asset without a range', () => {
    const response = createMediaResponse(file, undefined)
    expect(response.status).toBe(200)
    expect(response.headers['Content-Length']).toBe('10')
    expect(response.body).toEqual(file)
  })

  it.each([
    ['bytes=2-5', '2345', 'bytes 2-5/10'],
    ['bytes=5-', '56789', 'bytes 5-9/10'],
    ['bytes=8-99', '89', 'bytes 8-9/10'],
    ['bytes=0-0', '0', 'bytes 0-0/10'],
  ])(
    'serves the requested bytes for seek request %s',
    (range, body, contentRange) => {
      const response = createMediaResponse(file, range)
      expect(response.status).toBe(206)
      expect(response.body.toString()).toBe(body)
      expect(response.headers).toMatchObject({
        'Content-Range': contentRange,
        'Content-Length': String(body.length),
        'Accept-Ranges': 'bytes',
      })
    },
  )

  it.each(['bytes=10-', 'bytes=6-2', 'bytes=999999999999999999999-'])(
    'rejects unsatisfiable bytes %s',
    (range) => {
      const response = createMediaResponse(file, range)
      expect(response.status).toBe(416)
      expect(response.headers['Content-Range']).toBe('bytes */10')
      expect(response.body.length).toBe(0)
    },
  )

  it('rejects a range into an empty asset', () => {
    expect(createMediaResponse(Buffer.alloc(0), 'bytes=0-').status).toBe(416)
  })

  it.each(['items=2-5', 'bytes=0-2,4-5', 'bytes=-3', 'bytes=bad', ''])(
    'ignores unsupported range format %s',
    (range) => {
      const response = createMediaResponse(file, range)
      expect(response.status).toBe(200)
      expect(response.body).toEqual(file)
    },
  )
})
