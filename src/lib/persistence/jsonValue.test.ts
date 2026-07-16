import { describe, expect, it } from 'vitest'

import { isJsonValue } from './jsonValue'

describe('isJsonValue', () => {
  it('accepts nested values that round-trip through JSON without loss', () => {
    expect(
      isJsonValue({
        array: [null, true, 1, 'value', { nested: false }],
        object: { key: 'value' },
      }),
    ).toBe(true)
  })

  it.each([
    ['undefined', undefined],
    ['non-finite number', Number.NaN],
    ['bigint', 1n],
    ['function', () => undefined],
    ['symbol', Symbol('value')],
    ['Date', new Date(0)],
    ['Map', new Map([['key', 'value']])],
    ['typed array', new Uint8Array([1])],
    ['sparse array', Object.defineProperty([], 'length', { value: 1 })],
    [
      'array with symbol property',
      Object.defineProperty([], Symbol('metadata'), {
        enumerable: true,
        value: true,
      }),
    ],
    ['object with symbol property', { [Symbol('metadata')]: true }],
    ['object property with undefined', { value: undefined }],
  ])('rejects %s', (_name, value) => {
    expect(isJsonValue(value)).toBe(false)
  })

  it('rejects circular objects and arrays', () => {
    const circularObject: Record<string, unknown> = {}
    circularObject.self = circularObject
    const circularArray: unknown[] = []
    circularArray.push(circularArray)

    expect(isJsonValue(circularObject)).toBe(false)
    expect(isJsonValue(circularArray)).toBe(false)
  })
})
