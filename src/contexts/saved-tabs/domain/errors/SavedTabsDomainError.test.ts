import { describe, expect, it } from 'vitest'

import { SavedTabsDomainError } from './SavedTabsDomainError'

describe('SavedTabsDomainError', () => {
  it('Error を継承し name / message / code を保持する', () => {
    const error = new SavedTabsDomainError('message', 'INVALID_URL')
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(SavedTabsDomainError)
    expect(error.name).toBe('SavedTabsDomainError')
    expect(error.message).toBe('message')
    expect(error.code).toBe('INVALID_URL')
  })
})
