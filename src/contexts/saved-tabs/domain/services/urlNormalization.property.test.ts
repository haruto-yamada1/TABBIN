import * as fc from 'fast-check'
import { describe, it } from 'vitest'

import {
  createDomainName,
  domainNameToString,
  normalizeDomainString,
} from '@/contexts/saved-tabs/domain/value-objects/DomainName'
import { normalizeUrlCandidate } from '@/lib/url-filter'
import { fastCheckParameters } from '@/test/arbitraries/persistence/fastCheckParameters'
import {
  domainNameArbitrary,
  urlStringArbitrary,
} from '@/test/arbitraries/persistence/primitives'

import { createUrlIdentityKey, hasSameUrlIdentity } from './UrlIdentityPolicy'

// Invariant reference: docs/testing/property-based-tests.md
describe('URL / domain normalization properties', () => {
  it('createUrlIdentityKey is idempotent (exact-url-v1)', () => {
    fc.assert(
      fc.property(urlStringArbitrary, (url) => {
        const once = createUrlIdentityKey(url)
        return (
          createUrlIdentityKey(once) === once && hasSameUrlIdentity(url, once)
        )
      }),
      fastCheckParameters,
    )
  })

  it('normalizeUrlCandidate is idempotent over arbitrary input', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.constant(null), fc.constant(undefined)),
        (input) =>
          normalizeUrlCandidate(normalizeUrlCandidate(input)) ===
          normalizeUrlCandidate(input),
      ),
      fastCheckParameters,
    )
  })

  it('normalizeDomainString is idempotent over arbitrary input', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (input) =>
          normalizeDomainString(normalizeDomainString(input)) ===
          normalizeDomainString(input),
      ),
      fastCheckParameters,
    )
  })

  it('createDomainName normalization is idempotent for valid inputs', () => {
    fc.assert(
      fc.property(
        domainNameArbitrary,
        (input) =>
          domainNameToString(
            createDomainName(domainNameToString(createDomainName(input))),
          ) === domainNameToString(createDomainName(input)),
      ),
      fastCheckParameters,
    )
  })
})
