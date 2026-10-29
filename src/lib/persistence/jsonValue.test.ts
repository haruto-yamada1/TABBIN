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

  it.each([
    [1, undefined],
    [undefined, 1],
    ['value', Number.NaN],
    [null, { nested: undefined }],
  ])('rejects an array if any item would be lost: %j', (...items) => {
    expect(isJsonValue(items)).toBe(false)
  })

  it('accepts shared references that are not ancestors of themselves', () => {
    const sharedObject = { value: 1 }
    const sharedArray = [sharedObject]

    expect(isJsonValue([sharedObject, sharedObject])).toBe(true)
    expect(isJsonValue({ left: sharedArray, right: sharedArray })).toBe(true)
  })

  it('rejects non-enumerable properties that JSON would discard', () => {
    const value = Object.defineProperty({}, 'hidden', { value: 'private' })

    expect(isJsonValue(value)).toBe(false)
  })

  it.each(['00', '1 ', '4294967295'])(
    'rejects a hidden array property outside JSON indexes: %s',
    (key) => {
      const value = Object.defineProperty([1, 2], key, { value: 'private' })

      expect(isJsonValue(value)).toBe(false)
    },
  )

  it('accepts a JSON record with a null prototype', () => {
    const value: unknown = Object.create(null)
    if (typeof value !== 'object' || value === null) {
      throw new TypeError('Expected a record')
    }
    Object.defineProperty(value, 'key', { enumerable: true, value: 'value' })

    expect(isJsonValue(value)).toBe(true)
  })
})
