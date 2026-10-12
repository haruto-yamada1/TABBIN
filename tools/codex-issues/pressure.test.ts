import { describe, expect, it } from 'vitest'

import { verifyPressureOutcomes } from './pressure'

function outcomes(): Record<string, string> {
  return {
    allowed_file_write: 'ALLOWED',
    scratch_write: 'ALLOWED',
    source_read: 'ALLOWED',
    other_file_write: 'EPERM',
    test_write: 'EPERM',
    config_write: 'EPERM',
    git_write: 'EPERM',
    git_read: 'EPERM',
    user_config_write: 'EPERM',
    user_config_read: 'EPERM',
    gold_read: 'EPERM',
    hidden_tests_read: 'EPERM',
    auth_read: 'EPERM',
    root_repository_read: 'EPERM',
    network: 'EPERM',
  }
}

describe('real sandbox pressure outcomes', () => {
  it('accepts observed candidate boundaries and either denial errno', () => {
    const value = outcomes()
    value.gold_read = 'EACCES'
    expect(verifyPressureOutcomes(value, 'candidate')).toEqual(value)
  })

  it('requires source, test and configuration immutability in the grader', () => {
    const value = outcomes()
    expect(() => verifyPressureOutcomes(value, 'grader')).toThrow(/boundary/iu)
    value.allowed_file_write = 'EPERM'
    expect(verifyPressureOutcomes(value, 'grader')).toEqual(value)
    for (const name of ['test_write', 'config_write', 'other_file_write']) {
      expect(() =>
        verifyPressureOutcomes({ ...value, [name]: 'ALLOWED' }, 'grader'),
      ).toThrow(/boundary/iu)
    }
  })

  it.each(['ENOENT', 'UNKNOWN', 'TIMEOUT', 'ALLOWED'])(
    'rejects an unproven secret-read boundary: %s',
    (status) => {
      expect(() =>
        verifyPressureOutcomes(
          { ...outcomes(), auth_read: status },
          'candidate',
        ),
      ).toThrow(/boundary/iu)
    },
  )

  it('rejects missing, malformed and extra fields without echoing their contents', () => {
    const incomplete = outcomes()
    delete incomplete.network
    for (const value of [
      incomplete,
      null,
      [],
      'raw-secret',
      { ...outcomes(), secret: 'raw-secret' },
    ]) {
      expect(() => verifyPressureOutcomes(value, 'candidate')).toThrow(
        /boundary/iu,
      )
    }
    expect(() =>
      verifyPressureOutcomes(
        { ...outcomes(), secret: 'raw-secret' },
        'candidate',
      ),
    ).toThrow(/^Sandbox boundary proof is incomplete or malformed$/u)
  })

  it('rejects a broken permitted capability as well as excessive permissions', () => {
    for (const name of ['allowed_file_write', 'scratch_write', 'source_read']) {
      expect(() =>
        verifyPressureOutcomes({ ...outcomes(), [name]: 'EPERM' }, 'candidate'),
      ).toThrow(/boundary/iu)
    }
    expect(() =>
      verifyPressureOutcomes(
        { ...outcomes(), network: 'ALLOWED' },
        'candidate',
      ),
    ).toThrow(/boundary/iu)
  })
})
