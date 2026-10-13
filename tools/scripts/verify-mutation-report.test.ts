import { describe, expect, it } from 'vitest'

import { verifyMutationReport } from './verify-mutation-report'

const PRIVATE_SOURCE = 'private source and replacement content'

const createReport = (mutants: readonly unknown[]) => ({
  schemaVersion: '1.0',
  files: {
    'src/domain.ts': {
      source: PRIVATE_SOURCE,
      mutants,
    },
  },
})

describe('verifyMutationReport', () => {
  it('counts completed outcomes across files without retaining source content', () => {
    const report = {
      schemaVersion: '1.0',
      files: {
        'src/first.ts': {
          source: PRIVATE_SOURCE,
          mutants: [
            { status: 'Killed', testsCompleted: 1 },
            { status: 'Killed' },
            { status: 'Survived', testsCompleted: 2 },
          ],
        },
        'src/second.ts': {
          source: PRIVATE_SOURCE,
          mutants: [
            { status: 'NoCoverage', testsCompleted: 0 },
            { status: 'Timeout' },
            { status: 'Ignored', statusReason: PRIVATE_SOURCE },
          ],
        },
      },
    }

    const summary = verifyMutationReport(report)

    expect(summary).toEqual({
      total: 6,
      killed: 2,
      survived: 1,
      noCoverage: 1,
      timeout: 1,
      ignored: 1,
    })
    expect(JSON.stringify(summary)).not.toContain(PRIVATE_SOURCE)
  })

  it.each([undefined, 0])(
    'rejects a Survived outcome with testsCompleted=%s',
    (testsCompleted) => {
      const mutant = {
        status: 'Survived',
        ...(testsCompleted === undefined ? {} : { testsCompleted }),
      }

      expect(() => verifyMutationReport(createReport([mutant]))).toThrow(
        'Survived mutants require at least one completed test',
      )
    },
  )

  it.each([undefined, 1, '1', '2'])(
    'rejects unsupported or missing report schemaVersion=%s',
    (schemaVersion) => {
      expect(() =>
        verifyMutationReport({
          ...createReport([{ status: 'Killed' }]),
          schemaVersion,
        }),
      ).toThrow('Mutation report is missing, empty, or malformed')
    },
  )

  it('accepts a survivor only when at least one test completed', () => {
    expect(
      verifyMutationReport(
        createReport([{ status: 'Survived', testsCompleted: 1 }]),
      ),
    ).toMatchObject({ total: 1, survived: 1 })
  })

  it.each(['RuntimeError', 'CompileError', 'Pending'])(
    'rejects %s outcomes even when another mutant completed',
    (status) => {
      expect(() =>
        verifyMutationReport(createReport([{ status: 'Killed' }, { status }])),
      ).toThrow('Mutation report contains failed mutant execution')
    },
  )

  it.each([
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
    '1',
    null,
  ])('rejects invalid testsCompleted=%s', (testsCompleted) => {
    expect(() =>
      verifyMutationReport(
        createReport([{ status: 'Survived', testsCompleted }]),
      ),
    ).toThrow('Mutation report is missing, empty, or malformed')
  })

  it.each([
    undefined,
    null,
    {},
    { schemaVersion: '1.0', files: [] },
    { schemaVersion: '1.0', files: {} },
    { schemaVersion: '1.0', files: { 'src/empty.ts': {} } },
    { schemaVersion: '1.0', files: { 'src/empty.ts': { mutants: [] } } },
    { schemaVersion: '1.0', files: { 'src/invalid.ts': { mutants: {} } } },
    createReport([null]),
    createReport([{}]),
    createReport([{ status: 'Unknown' }]),
  ])('rejects missing, empty, or malformed report data %#', (report) => {
    expect(() => verifyMutationReport(report)).toThrow(
      'Mutation report is missing, empty, or malformed',
    )
  })

  it('does not include raw content in rejected report diagnostics', () => {
    let caughtError: unknown
    try {
      verifyMutationReport(
        createReport([{ status: PRIVATE_SOURCE, replacement: PRIVATE_SOURCE }]),
      )
    } catch (error) {
      caughtError = error
    }

    expect(caughtError).toBeInstanceOf(Error)
    expect(String(caughtError)).not.toContain(PRIVATE_SOURCE)
  })
})
