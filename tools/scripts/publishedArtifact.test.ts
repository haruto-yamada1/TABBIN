import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { strToU8, zipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'

import {
  buildChromeWebStoreUrl,
  decodePublishedArtifactManifest,
  extractCrxPayload,
  extractZipToDirectory,
  resolvePublishedArtifact,
  verifyArtifactChecksum,
} from './publishedArtifact.ts'
import type { PublishedArtifactManifest } from './publishedArtifact.ts'

const repositoryRoot = path.resolve(import.meta.dirname, '../..')
const persistedRelease = {
  databaseVersion: 1,
  minimumCompatibleAppVersion: '2.0.19',
  persistenceGeneration: 2,
  rollbackCompatibility: {
    databaseDowngradeCompatible: true,
    destructiveSchemaChange: false,
    queryWriteContractCompatible: true,
  },
}

const sha256 = (bytes: Uint8Array): string =>
  createHash('sha256').update(bytes).digest('hex')

const createArtifactZip = ({
  manifestVersion = '2.0.19',
  persistenceRelease = persistedRelease,
}: {
  readonly manifestVersion?: string
  readonly persistenceRelease?: unknown
} = {}): Uint8Array =>
  zipSync({
    'manifest.json': strToU8(JSON.stringify({ version: manifestVersion })),
    'persistence-release.json': strToU8(JSON.stringify(persistenceRelease)),
  })

const createCrx = (zip: Uint8Array, version: 2 | 3 = 3): Uint8Array => {
  const header = new Uint8Array([1, 2, 3, 4, 5, 6])
  const headerBytes = version === 3 ? 12 : 16
  const bytes = new Uint8Array(headerBytes + header.length + zip.length)
  bytes.set(strToU8('Cr24'), 0)
  const view = new DataView(bytes.buffer)
  view.setUint32(4, version, true)
  if (version === 3) {
    view.setUint32(8, header.length, true)
  } else {
    view.setUint32(8, header.length, true)
    view.setUint32(12, 0, true)
  }
  bytes.set(header, headerBytes)
  bytes.set(zip, headerBytes + header.length)
  return bytes
}

const publishedChrome = (sha256Value: string) => ({
  status: 'published' as const,
  version: '2.0.19',
  extensionId: 'dljblklbpmoocinnlcejeokopmfoldaj',
  prodversion: '140.0',
  sha256: sha256Value,
})

const createManifest = (sha256Value: string): PublishedArtifactManifest =>
  ({
    schemaVersion: 1,
    chrome: publishedChrome(sha256Value),
    firefox: {
      status: 'excluded',
      reason: 'The Firefox add-on is not published on AMO.',
    },
  }) satisfies PublishedArtifactManifest

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const buffer = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(buffer).set(bytes)
  return buffer
}

const fakeFetch = (bytes: Uint8Array) =>
  vi.fn(
    async () => new Response(toArrayBuffer(bytes), { status: 200 }),
  ) as unknown as typeof fetch

describe('published artifact pin', () => {
  it('validates the checked-in Chrome Web Store artifact pin', () => {
    const pin: unknown = JSON.parse(
      readFileSync(
        path.join(repositoryRoot, 'tools/release/published-artifacts.json'),
        'utf8',
      ),
    )

    expect(decodePublishedArtifactManifest(pin)).toMatchObject({
      chrome: {
        extensionId: 'dljblklbpmoocinnlcejeokopmfoldaj',
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        status: 'published',
        version: expect.stringMatching(/^\d+(?:\.\d+){0,3}$/u),
      },
      firefox: {
        reason: expect.any(String),
        status: 'excluded',
      },
      schemaVersion: 1,
    })
  })

  it('builds the official Chrome Web Store update URL from the pin', () => {
    expect(buildChromeWebStoreUrl(publishedChrome('a'.repeat(64)))).toBe(
      'https://clients2.google.com/service/update2/crx?response=redirect&prodversion=140.0&acceptformat=crx2,crx3&x=id%3Ddljblklbpmoocinnlcejeokopmfoldaj%26uc',
    )
  })

  it.each([
    ['unknown schema version', { schemaVersion: 2 }],
    ['uppercase checksum', { chrome: publishedChrome('A'.repeat(64)) }],
    ['short checksum', { chrome: publishedChrome('a'.repeat(63)) }],
    [
      'invalid extension id',
      {
        chrome: {
          ...publishedChrome('a'.repeat(64)),
          extensionId: 'not-an-extension-id',
        },
      },
    ],
    ['missing exclusion reason', { firefox: { status: 'excluded' } }],
    ['unknown browser status', { chrome: { status: 'missing' } }],
  ])('rejects %s', (_label, override) => {
    expect(() =>
      decodePublishedArtifactManifest({
        ...createManifest('a'.repeat(64)),
        ...override,
      }),
    ).toThrow(/invalid/u)
  })
})

describe('published artifact verification', () => {
  it('accepts matching bytes and rejects a checksum mismatch', () => {
    const bytes = new Uint8Array([1, 2, 3])
    const digest = sha256(bytes)

    expect(
      verifyArtifactChecksum({
        bytes,
        expectedSha256: digest,
        label: 'chrome fixture',
      }),
    ).toBe(digest)
    expect(() =>
      verifyArtifactChecksum({
        bytes,
        expectedSha256: '0'.repeat(64),
        label: 'chrome fixture',
      }),
    ).toThrow(/checksum mismatch.*chrome fixture/iu)
  })

  it.each([2, 3] as const)('extracts a CRX v%s payload', (version) => {
    const zip = createArtifactZip()

    expect(extractCrxPayload(createCrx(zip, version))).toEqual(zip)
  })

  it.each([
    ['bad magic', new Uint8Array(32)],
    ['unsupported version', createCrx(new Uint8Array(), 3).fill(4, 4, 8)],
  ])('rejects a CRX with %s', (_label, bytes) => {
    expect(() => extractCrxPayload(bytes)).toThrow(/CRX/iu)
  })

  it('extracts ZIP entries without escaping the output directory', () => {
    const temporaryRoot = mkdtempSync(
      path.join(os.tmpdir(), 'tabbin-published-artifact-'),
    )
    try {
      const directory = path.join(temporaryRoot, 'artifact')
      extractZipToDirectory({
        bytes: zipSync({
          'assets/app.js': strToU8('console.log(1)'),
          'manifest.json': strToU8('{"version":"2.0.19"}'),
        }),
        directory,
      })

      expect(readdirSync(directory).toSorted()).toEqual([
        'assets',
        'manifest.json',
      ])
      expect(readFileSync(path.join(directory, 'assets/app.js'), 'utf8')).toBe(
        'console.log(1)',
      )
      expect(() =>
        extractZipToDirectory({
          bytes: zipSync({ '../escape': strToU8('no') }),
          directory,
        }),
      ).toThrow(/unsafe zip path/iu)
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true })
    }
  })

  it('downloads, verifies, extracts, and versions a published artifact', async () => {
    const temporaryRoot = mkdtempSync(
      path.join(os.tmpdir(), 'tabbin-published-artifact-'),
    )
    const bytes = createCrx(createArtifactZip())
    try {
      const result = await resolvePublishedArtifact({
        browser: 'chrome',
        fetchImpl: fakeFetch(bytes),
        manifest: createManifest(sha256(bytes)),
        outputDirectory: temporaryRoot,
      })

      expect(result).toMatchObject({
        browser: 'chrome',
        label: 'chrome-web-store@2.0.19',
        sha256: sha256(bytes),
        status: 'published',
        version: '2.0.19',
      })
      if (result.status !== 'published') {
        throw new Error('Expected a published artifact')
      }
      expect(
        JSON.parse(
          readFileSync(path.join(result.directory, 'manifest.json'), 'utf8'),
        ),
      ).toEqual({ version: '2.0.19' })
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true })
    }
  })

  it('reports an excluded browser instead of treating it as verified', async () => {
    const fetchImpl = vi.fn()
    const result = await resolvePublishedArtifact({
      browser: 'firefox',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      manifest: createManifest('a'.repeat(64)),
      outputDirectory: os.tmpdir(),
    })

    expect(result).toEqual({
      browser: 'firefox',
      followUp: undefined,
      reason: 'The Firefox add-on is not published on AMO.',
      status: 'excluded',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('fails closed on download, checksum, and version mismatches', async () => {
    const temporaryRoot = mkdtempSync(
      path.join(os.tmpdir(), 'tabbin-published-artifact-'),
    )
    const bytes = createCrx(createArtifactZip())
    try {
      await expect(
        resolvePublishedArtifact({
          browser: 'chrome',
          fetchImpl: fakeFetch(bytes),
          manifest: createManifest('0'.repeat(64)),
          outputDirectory: temporaryRoot,
        }),
      ).rejects.toThrow(/checksum mismatch/iu)

      await expect(
        resolvePublishedArtifact({
          browser: 'chrome',
          fetchImpl: (async () =>
            new Response('missing', {
              status: 404,
            })) as unknown as typeof fetch,
          manifest: createManifest(sha256(bytes)),
          outputDirectory: temporaryRoot,
        }),
      ).rejects.toThrow(/download failed.*404/iu)

      const otherVersion = createCrx(
        createArtifactZip({ manifestVersion: '2.0.20' }),
      )
      await expect(
        resolvePublishedArtifact({
          browser: 'chrome',
          fetchImpl: fakeFetch(otherVersion),
          manifest: createManifest(sha256(otherVersion)),
          outputDirectory: temporaryRoot,
        }),
      ).rejects.toThrow(/version mismatch/iu)

      const missingMetadata = createCrx(
        zipSync({
          'manifest.json': strToU8('{"version":"2.0.19"}'),
        }),
      )
      await expect(
        resolvePublishedArtifact({
          browser: 'chrome',
          fetchImpl: fakeFetch(missingMetadata),
          manifest: createManifest(sha256(missingMetadata)),
          outputDirectory: temporaryRoot,
        }),
      ).rejects.toThrow(/persistence-release\.json/iu)
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true })
    }
  })

  it('wraps network failures with the pinned source context', async () => {
    await expect(
      resolvePublishedArtifact({
        browser: 'chrome',
        fetchImpl: (async () => {
          throw new TypeError('network disabled')
        }) as unknown as typeof fetch,
        manifest: createManifest('a'.repeat(64)),
        outputDirectory: os.tmpdir(),
      }),
    ).rejects.toThrow(/download failed.*network disabled/iu)
  })
})
