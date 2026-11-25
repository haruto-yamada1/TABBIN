import { describe, expect, it } from 'vitest'

// eslint-disable-next-line import/no-relative-parent-imports -- exercise native fault injection and restoration directly
import { replaceMethod } from '../../e2e/support/firefox-capture-safety-harness'

const original = () => 'original'
const injected = () => 'injected'
const originalSetter = (_value: unknown): void => {}
const injectedSetter = (_value: unknown): void => {}
const descriptors: {
  name: string
  original: PropertyDescriptor
  corrupted: PropertyDescriptor
}[] = [
  {
    name: 'value',
    original: { value: original, writable: true },
    corrupted: { value: injected },
  },
  { name: 'get', original: { get: original }, corrupted: { get: injected } },
  {
    name: 'set',
    original: { set: originalSetter },
    corrupted: { set: injectedSetter },
  },
]

describe('Firefox capture smoke method restoration', () => {
  it.each(descriptors)(
    'restores the original $name function and descriptor flags',
    (fixture) => {
      const target = {}
      Object.defineProperty(target, 'method', {
        ...fixture.original,
        configurable: true,
        enumerable: true,
      })
      const before = Object.getOwnPropertyDescriptor(target, 'method')
      const restore = replaceMethod(target, 'method', injected)

      restore()

      expect(Object.getOwnPropertyDescriptor(target, 'method')).toStrictEqual(
        before,
      )
    },
  )

  it.each(descriptors)(
    'rejects a leftover $name override even when descriptor flags match',
    (fixture) => {
      const target = {}
      Object.defineProperty(target, 'method', {
        ...fixture.original,
        configurable: true,
        enumerable: true,
      })
      let restoring = false
      const proxy = new Proxy(target, {
        defineProperty(object, key, descriptor) {
          return Reflect.defineProperty(
            object,
            key,
            restoring ? { ...descriptor, ...fixture.corrupted } : descriptor,
          )
        },
      })
      const restore = replaceMethod(proxy, 'method', injected)
      restoring = true

      expect(restore).toThrow('Firefox capture smoke did not restore method.')
    },
  )

  it('removes an injected own method and preserves the inherited original', () => {
    const target = {}
    Object.setPrototypeOf(target, { method: original })
    const restore = replaceMethod(target, 'method', injected)

    restore()

    expect(Object.hasOwn(target, 'method')).toBe(false)
    expect(Reflect.get(target, 'method')).toBe(original)
  })
})
