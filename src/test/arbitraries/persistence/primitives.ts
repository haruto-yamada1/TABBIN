import * as fc from 'fast-check'

/** Non-negative epoch-millisecond timestamps up to 2100-01-01. */
export const timestampArbitrary = fc.integer({
  min: 0,
  max: 4_102_444_800_000,
})

/** `[earlier, later]` pair satisfying `earlier <= later`. */
export const orderedTimestampPairArbitrary = fc
  .tuple(timestampArbitrary, timestampArbitrary)
  .map(([left, right]): readonly [number, number] =>
    left <= right ? [left, right] : [right, left],
  )

/** Safe-integer gap rank accepted by the v2 ordering policy. */
export const sortOrderArbitrary = fc.integer({
  min: 0,
  max: Number.MAX_SAFE_INTEGER,
})

/** Hostname-shaped domain used by domain collections and legacy groups. */
export const domainNameArbitrary = fc.stringMatching(
  /^[a-z][a-z0-9-]{0,10}\.(test|example|dev)$/,
)

const urlPathArbitrary = fc.option(
  fc
    .array(fc.stringMatching(/^[a-z0-9-]{1,8}$/), {
      minLength: 1,
      maxLength: 3,
    })
    .map((segments) => `/${segments.join('/')}`),
  { nil: undefined },
)

/**
 * Valid absolute https URL string. Identity follows the exact-string
 * `exact-url-v1` policy, so the string itself is the normalized form.
 */
export const urlStringArbitrary = fc
  .tuple(domainNameArbitrary, urlPathArbitrary)
  .map(([domain, path]) => `https://${domain}${path ?? ''}`)

/**
 * Free-form display text. Keeps whitespace-only, empty-adjacent, and
 * unusual Unicode inputs in scope for titles, notes, and category names.
 */
export const displayTextArbitrary = fc.string({ maxLength: 24 })
