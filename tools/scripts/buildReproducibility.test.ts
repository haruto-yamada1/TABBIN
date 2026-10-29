import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { compareBuildZips } from './buildReproducibility'

const files = {
  'manifest.json': strToU8('{"manifest_version":3,"version":"2.0.19"}'),
  'background.js': strToU8('const value = 1'),
  'chunks/options-abcdefgh.js': strToU8('export default 1'),
  'persistence-release.json': strToU8('{"databaseVersion":1}'),
}
const zip = (
  contents: Record<string, Uint8Array> = files,
  date = new Date('2026-01-01T00:00:00Z'),
) => zipSync(contents, { mtime: date })

describe('independent build ZIP comparison', () => {
  it('reports both ZIP and exact extracted content equality', () => {
    const bytes = zip()
    expect(compareBuildZips(bytes, bytes)).toMatchObject({
      zipEqual: true,
      contentEqual: true,
      added: [],
      removed: [],
      changed: [],
      entryOrderEqual: true,
      metadataChanges: [],
    })
  })

  it('separates timestamp-only ZIP changes from content equality', () => {
    const result = compareBuildZips(
      zip(),
      zip(files, new Date('2026-02-01T00:00:00Z')),
    )
    expect(result).toMatchObject({
      zipEqual: false,
      contentEqual: true,
      changed: [],
    })
    expect(result.metadataChanges).toContain('manifest.json: timestamp')
  })

  it('reports entry order without normalizing the archive', () => {
    const reversed = Object.fromEntries(Object.entries(files).toReversed())
    expect(compareBuildZips(zip(), zip(reversed))).toMatchObject({
      zipEqual: false,
      contentEqual: true,
      entryOrderEqual: false,
    })
  })

  it('does not treat compression differences as code changes', () => {
    expect(
      compareBuildZips(
        zip(),
        zipSync(files, { level: 0, mtime: new Date('2026-01-01T00:00:00Z') }),
      ),
    ).toMatchObject({
      zipEqual: false,
      contentEqual: true,
    })
  })

  it.each(['manifest.json', 'background.js', 'persistence-release.json'])(
    'detects changed %s bytes',
    (name) => {
      const modified = {
        ...files,
        [name]: strToU8(
          name === 'manifest.json' ? '{"version":"9"}' : 'changed',
        ),
      }
      expect(compareBuildZips(zip(), zip(modified))).toMatchObject({
        contentEqual: false,
        changed: [name],
      })
    },
  )

  it('keeps changed chunk names and missing files visible', () => {
    const modified: Record<string, Uint8Array> = {
      ...files,
      'chunks/options-ijklmnop.js': files['chunks/options-abcdefgh.js'],
    }
    delete modified['chunks/options-abcdefgh.js']
    expect(compareBuildZips(zip(), zip(modified))).toMatchObject({
      contentEqual: false,
      added: ['chunks/options-ijklmnop.js'],
      removed: ['chunks/options-abcdefgh.js'],
    })
  })

  it.each([
    '../escape.js',
    '/absolute.js',
    'chunks/../escape.js',
    String.raw`bad\file.js`,
  ])('rejects unsafe archive name %s', (name) => {
    expect(() =>
      compareBuildZips(zip(), zip({ ...files, [name]: strToU8('bad') })),
    ).toThrow(/path/u)
  })

  it('rejects truncated archives and missing or invalid manifests', () => {
    expect(() => compareBuildZips(zip(), new Uint8Array([1, 2]))).toThrow(
      /ZIP/u,
    )
    expect(() =>
      compareBuildZips(zip(), zip({ 'background.js': strToU8('x') })),
    ).toThrow(/manifest/u)
    expect(() =>
      compareBuildZips(
        zip(),
        zip({ ...files, 'manifest.json': strToU8('null') }),
      ),
    ).toThrow(/manifest/u)
  })

  it('rejects duplicate entries instead of losing one during decompression', () => {
    const bytes = zip({ ...files, 'background.jx': strToU8('different') })
    const search = strToU8('background.jx')
    for (let offset = 0; offset < bytes.length - search.length; offset++) {
      if (search.every((value, index) => bytes[offset + index] === value)) {
        bytes[offset + search.length - 1] = 115
      }
    }
    expect(() => compareBuildZips(zip(), bytes)).toThrow(/Duplicate/u)
  })

  it('rejects a corrupt central CRC even when decompressed content is equal', () => {
    const bytes = zip()
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const central = view.getUint32(bytes.length - 6, true)
    view.setUint32(central + 16, view.getUint32(central + 16, true) ^ 1, true)
    expect(() => compareBuildZips(zip(), bytes)).toThrow(/CRC/u)
  })

  it('rejects mismatched local and central entry names', () => {
    const bytes = zip()
    bytes[30] = 120
    expect(() => compareBuildZips(zip(), bytes)).toThrow(/local.*header/u)
  })

  it('reports local-only timestamp differences', () => {
    const bytes = zip()
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    view.setUint16(10, view.getUint16(10, true) + 1, true)
    expect(compareBuildZips(zip(), bytes)).toMatchObject({
      zipEqual: false,
      contentEqual: true,
      metadataChanges: ['manifest.json: local timestamp'],
    })
  })

  it('checks the decompressed CRC even when both headers claim the same wrong CRC', () => {
    const bytes = zip()
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const central = view.getUint32(bytes.length - 6, true)
    const wrongCrc = view.getUint32(central + 16, true) ^ 1
    view.setUint32(central + 16, wrongCrc, true)
    view.setUint32(14, wrongCrc, true)
    expect(() => compareBuildZips(zip(), bytes)).toThrow(/content CRC/u)
  })

  it.each(['encrypted', 'symlink'])(
    'rejects an unsupported %s entry',
    (kind) => {
      const bytes = zip()
      const view = new DataView(
        bytes.buffer,
        bytes.byteOffset,
        bytes.byteLength,
      )
      const central = view.getUint32(bytes.length - 6, true)
      if (kind === 'encrypted') {
        view.setUint16(central + 8, view.getUint16(central + 8, true) | 1, true)
      } else {
        view.setUint32(central + 38, 2684354560, true)
      }
      expect(() => compareBuildZips(zip(), bytes)).toThrow(
        /encrypted\/symlink/u,
      )
    },
  )
})
