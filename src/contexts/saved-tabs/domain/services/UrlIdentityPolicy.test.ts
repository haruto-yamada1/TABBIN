import { describe, expect, it } from 'vitest'

import { URL_IDENTITY_CORPUS } from './urlIdentityCorpus'
import {
  URL_IDENTITY_POLICY_VERSION,
  createUrlIdentityKey,
  hasSameUrlIdentity,
} from './UrlIdentityPolicy'

const REQUIRED_DIMENSIONS = [
  'default-port',
  'extension-url',
  'file-url',
  'hash',
  'hostname-case',
  'identical',
  'international-domain',
  'localhost-loopback',
  'percent-encoding',
  'protocol',
  'query',
  'spa-route',
  'tracking-parameter',
  'trailing-slash',
  'www',
] as const

describe('URL identity policy', () => {
  it('keeps current exact-string identity as a versioned contract', () => {
    expect(URL_IDENTITY_POLICY_VERSION).toBe('exact-url-v1')
    expect(createUrlIdentityKey('https://EXAMPLE.com:443/a?b=1#c')).toBe(
      'https://EXAMPLE.com:443/a?b=1#c',
    )
  })

  it('covers every identity dimension required by Issue #725', () => {
    expect(
      URL_IDENTITY_CORPUS.map(({ dimension }) => dimension).toSorted(),
    ).toStrictEqual([...REQUIRED_DIMENSIONS].toSorted())
  })

  it.each(URL_IDENTITY_CORPUS)(
    '$dimension: $left / $right',
    ({ expectedSameIdentity, left, right }) => {
      expect(hasSameUrlIdentity(left, right)).toBe(expectedSameIdentity)
    },
  )

  it('rejects a value that is not a valid URL without logging the input', () => {
    expect(() => createUrlIdentityKey('not a URL')).toThrow(
      'URL の形式が不正です',
    )
  })
})
