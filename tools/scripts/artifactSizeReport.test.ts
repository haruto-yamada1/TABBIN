import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { collectArtifactSize } from './artifactSizeReport'

const temporaryDirectories: string[] = []
const fixture = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'artifact-size-'))
  temporaryDirectories.push(root)
  const directory = path.join(root, 'chrome-mv3')
  mkdirSync(path.join(directory, 'chunks'), { recursive: true })
  const files: Record<string, string> = {
    'manifest.json': '{}',
    'background.js': 'background',
    'saved-tabs.html':
      '<script type="module" src="/chunks/saved-tabs-abcdefgh.js"></script>',
    'options.html':
      '<script src="/chunks/options-12345678.js" type="module"></script>',
    'chunks/saved-tabs-abcdefgh.js': 'saved-tabs',
    'chunks/options-12345678.js': 'options',
    'chunks/shared-AbCdEf_-.js': 'shared',
    'chunks/shared-ZYXWVU09.js': 'other',
    '.hidden': 'hidden',
  }
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(directory, name), content)
  }
  const zip = path.join(root, 'tabbin-chrome.zip')
  writeFileSync(zip, Buffer.alloc(42))
  return { directory, zip, files }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('artifact size collection', () => {
  it('keeps hash-only rebuilds comparable and sums UTF-8 bytes instead of characters', () => {
    const { directory, zip } = fixture()
    const before = collectArtifactSize(directory, zip)
    renameSync(
      path.join(directory, 'chunks/shared-AbCdEf_-.js'),
      path.join(directory, 'chunks/shared-1234abcd.js'),
    )
    expect(collectArtifactSize(directory, zip).chunks).toEqual(before.chunks)
    writeFileSync(path.join(directory, '.hidden'), '日本語')
    expect(collectArtifactSize(directory, zip).unpackedBytes).toBe(
      before.unpackedBytes + 3,
    )
  })

  it('resolves relative scripts once and preserves dependency-generated name segments', () => {
    const { directory, zip } = fixture()
    writeFileSync(
      path.join(directory, 'options.html'),
      '<script src="./chunks/options-12345678.js"></script><script src="./chunks/options-12345678.js"></script>',
    )
    writeFileSync(
      path.join(directory, 'chunks/chunk-TCCFYFTB-B7xjHAwS.js'),
      'large',
    )
    const report = collectArtifactSize(directory, zip)
    expect(report.entries.options).toBe(7)
    expect(report.chunks['chunks/chunk-TCCFYFTB.js']).toBe(5)
  })

  it.each([
    'background.js',
    'manifest.json',
    'saved-tabs.html',
    'options.html',
    'chunks/options-12345678.js',
  ])('rejects missing required output %s', (file) => {
    const { directory, zip } = fixture()
    rmSync(path.join(directory, file))
    expect(() => collectArtifactSize(directory, zip)).toThrow(/Missing/u)
  })

  it('rejects missing or empty archives and unbuilt HTML', () => {
    const { directory, zip } = fixture()
    rmSync(zip)
    expect(() => collectArtifactSize(directory, zip)).toThrow(/ENOENT/u)
    writeFileSync(zip, '')
    expect(() => collectArtifactSize(directory, zip)).toThrow(/ZIP/u)
    writeFileSync(zip, 'archive')
    writeFileSync(path.join(directory, 'options.html'), '<html></html>')
    expect(() => collectArtifactSize(directory, zip)).toThrow(
      /Missing entry script/u,
    )
  })

  it('rejects symbolic links instead of counting files outside the artifact', () => {
    const { directory, zip } = fixture()
    symlinkSync(zip, path.join(directory, 'outside.zip'))
    expect(() => collectArtifactSize(directory, zip)).toThrow(/Symlink/u)
  })

  it('counts actual archive bytes and all packaged files, groups hashes without dropping collisions, and resolves HTML entries', () => {
    const { directory, zip, files } = fixture()
    const result = collectArtifactSize(directory, zip)
    expect(result).toMatchObject({
      zipBytes: 42,
      unpackedBytes: Object.values(files).reduce(
        (sum, value) => sum + Buffer.byteLength(value),
        0,
      ),
      javascriptBytes: 38,
      assetCount: 9,
      entries: { background: 10, 'saved-tabs': 10, options: 7 },
      chunks: { 'chunks/shared.js': 11 },
    })
    expect(result.largestAssets[0]).toMatchObject({ path: 'saved-tabs.html' })
  })
})
