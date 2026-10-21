import { zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { readFlakeArchive } from './read-flake-archive'

const MAX_BYTES = 5 * 1024 * 1024

describe('data-only bounded ZIP report reader', () => {
  it('reads stored and deflated report JSON without exposing archive paths', () => {
    for (const level of [0, 6] as const) {
      expect(
        readFlakeArchive(
          zipSync(
            { 'flake-coverage.json': Buffer.from('{"safe":true}') },
            { level },
          ),
        ),
      ).toBe('{"safe":true}')
    }
  })

  it('rejects traversal paths, extra entries and missing reports', () => {
    expect(() =>
      readFlakeArchive(
        zipSync({ '../flake-coverage.json': Buffer.from('{}') }),
      ),
    ).toThrow('Invalid report archive entry')
    expect(() =>
      readFlakeArchive(
        zipSync({
          'flake-a.json': Buffer.from('{}'),
          'flake-b.json': Buffer.from('{}'),
        }),
      ),
    ).toThrow('Invalid report archive entry')
    expect(() => readFlakeArchive(zipSync({}))).toThrow(
      'Incomplete report archive',
    )
  })

  it('rejects declared and actual inflated output above the budget', () => {
    const bomb = zipSync(
      { 'flake-bomb.json': Buffer.alloc(MAX_BYTES + 1, 65) },
      { level: 9 },
    )
    expect(() => readFlakeArchive(bomb)).toThrow(
      'Expanded report exceeds budget',
    )
    // A forged local header cannot bypass the actual streaming output check.
    const forged = Buffer.from(bomb)
    forged.writeUInt32LE(1, 22)
    const centralOffset = forged.indexOf(Buffer.from('504b0102', 'hex'))
    expect(centralOffset).toBeGreaterThan(0)
    forged.writeUInt32LE(1, centralOffset + 24)
    expect(() => readFlakeArchive(forged)).toThrow(
      'Expanded report exceeds budget',
    )
  })

  it('rejects archives truncated after a complete local payload', () => {
    const valid = zipSync({ 'flake-a.json': Buffer.from('{}') }, { level: 0 })
    expect(() =>
      readFlakeArchive(valid.subarray(0, 30 + 'flake-a.json'.length + 2)),
    ).toThrow(/(?:invalid|incomplete)/iu)
    expect(() => readFlakeArchive(valid.subarray(0, -22))).toThrow(
      /(?:invalid|incomplete)/iu,
    )
  })

  it('rejects oversized compressed input and truncated file data', () => {
    expect(() => readFlakeArchive(Buffer.alloc(MAX_BYTES + 1))).toThrow(
      'Compressed report exceeds budget',
    )
    const valid = zipSync(
      { 'flake-a.json': Buffer.from('x'.repeat(500)) },
      { level: 0 },
    )
    expect(() => readFlakeArchive(valid.subarray(0, 60))).toThrow(
      /(?:Incomplete|invalid|unexpected)/iu,
    )
  })
})
