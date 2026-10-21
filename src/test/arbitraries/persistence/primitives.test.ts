import * as fc from 'fast-check'
import { describe, it } from 'vitest'

import { urlStringArbitrary } from './primitives'

describe('persistence URL arbitrary', () => {
  it('generates valid HTTPS URLs for the invalid-punycode replay seed', () => {
    fc.assert(
      fc.property(
        urlStringArbitrary,
        (input) => new URL(input).protocol === 'https:',
      ),
      { numRuns: 50, seed: 41900941 },
    )
  })
})
