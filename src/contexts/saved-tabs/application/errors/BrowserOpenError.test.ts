import { describe, expect, it } from 'vitest'

import {
  BrowserOpenError,
  toBrowserOpenFailureReason,
} from './BrowserOpenError'

describe('BrowserOpenError', () => {
  it.each([
    'permission',
    'restrictedUrl',
    'tabLimit',
    'unavailable',
    'unknown',
  ] as const)('typed reason %s を安全なエラーとして保持する', (reason) => {
    const error = new BrowserOpenError(reason)

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('BrowserOpenError')
    expect(error.message).not.toBe('')
    expect(toBrowserOpenFailureReason(error)).toBe(reason)
  })

  it.each([
    new Error('Permission denied for private browser diagnostics'),
    { reason: 'permission', message: 'private browser diagnostics' },
    'restricted URL: private browser diagnostics',
    null,
    undefined,
  ])('外部エラーの診断文や偽のreasonを信用しない: %j', (error) => {
    expect(toBrowserOpenFailureReason(error)).toBe('unknown')
  })
})
