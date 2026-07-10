import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSystemIdGenerator } from './SystemIdGeneratorAdapter'

describe('SystemIdGeneratorAdapter', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('crypto.randomUUID() を呼び出して ID 文字列を返す', () => {
    const idGenerator = createSystemIdGenerator()
    const spy = vi.spyOn(crypto, 'randomUUID').mockReturnValue('test-uuid-1234')
    expect(idGenerator.generate()).toBe('test-uuid-1234')
    expect(spy).toHaveBeenCalledOnce()
  })

  it('IdGeneratorPort interface に適合する', () => {
    const idGenerator = createSystemIdGenerator()
    expect(idGenerator.generate).toBeTypeOf('function')
  })
})
