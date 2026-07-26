import { describe, expect, it } from 'vitest'

import { redactUrlForLog } from './redact-url'

describe('redactUrlForLog', () => {
  it.each([
    'https://secret.example.com/private/path?token=top-secret#account',
    'secret.example.com',
    new URL('https://user:password@example.com/private'),
  ])('URLやドメインの構成要素をログへ残さない: %s', (value) => {
    const result = redactUrlForLog(value)

    expect(result).toBe('[redacted-url]')
    expect(result).not.toContain('secret')
    expect(result).not.toContain('private')
    expect(result).not.toContain('token')
    expect(result).not.toContain('password')
  })

  it.each([undefined, null, ''])(
    '欠損値は区別できる固定値にする: %s',
    (value) => {
      expect(redactUrlForLog(value)).toBe('[missing-url]')
    },
  )
})
