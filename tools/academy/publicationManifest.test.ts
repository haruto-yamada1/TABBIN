import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import saveTabs from '#academy-save-scenario'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseScenario } from './pipeline/scenario'
import {
  createPublicationManifest,
  readNativeStoreVersion,
} from './publicationManifest'

const scenario = parseScenario(saveTabs)
const input = {
  scenario,
  scenarioSha256: 'a'.repeat(64),
  assets: { en: { bytes: 200 }, ja: { bytes: 100 } },
  nativeStoreVersion: '3.1.7',
}

describe('published lesson manifest', () => {
  it('serializes locale assets in Japanese/English order regardless of insertion order', () => {
    const manifest = createPublicationManifest(input)
    expect(Object.keys(manifest.assets)).toEqual(['ja', 'en'])
    expect(JSON.stringify(manifest.assets)).toBe(
      '{"ja":{"bytes":100},"en":{"bytes":200}}',
    )
  })

  it('records the publication date in UTC instead of the first production date', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2031-07-14T23:58:00-05:00'))
    expect(createPublicationManifest(input).updatedAt).toBe('2031-07-15')
  })

  it('uses the installed version supplied by the native recording evidence', () => {
    expect(createPublicationManifest(input).nativeStoreVersion).toBe('3.1.7')
  })
})

const roots: string[] = []
const evidence = (version: unknown) => ({
  installation: {
    source: 'chrome-web-store',
    id: 'dljblklbpmoocinnlcejeokopmfoldaj',
    installType: 'normal',
    name: 'TABBIN',
    manifestVersion: 3,
    version,
  },
})
const createEvidenceDirectories = async (
  japanese: unknown,
  english: unknown,
) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'academy-publish-evidence-'),
  )
  roots.push(root)
  const directories = { ja: path.join(root, 'ja'), en: path.join(root, 'en') }
  await Promise.all(
    (['ja', 'en'] as const).map(async (locale) => {
      await mkdir(directories[locale])
      await writeFile(
        path.join(directories[locale], 'native-evidence.json'),
        JSON.stringify(locale === 'ja' ? japanese : english),
      )
    }),
  )
  return directories
}

afterEach(async () => {
  vi.useRealTimers()
  await Promise.all(
    roots
      .splice(0)
      .map(async (root) => rm(root, { recursive: true, force: true })),
  )
})

describe('native installation provenance at publication', () => {
  it('uses matching installation evidence in both localized render directories', async () => {
    const directories = await createEvidenceDirectories(
      evidence('3.1.7'),
      evidence('3.1.7'),
    )
    await expect(readNativeStoreVersion(directories)).resolves.toBe('3.1.7')
  })

  it('rejects localized renders from different extension versions', async () => {
    const directories = await createEvidenceDirectories(
      evidence('3.1.7'),
      evidence('3.1.8'),
    )
    await expect(readNativeStoreVersion(directories)).rejects.toThrow(
      'different native installation versions',
    )
  })

  it.each([undefined, null, 7, '', '   '])(
    'rejects a missing or invalid installation version %j',
    async (version) => {
      const directories = await createEvidenceDirectories(
        evidence(version),
        evidence('3.1.7'),
      )
      await expect(readNativeStoreVersion(directories)).rejects.toThrow(
        'Native installation evidence is invalid: ja',
      )
    },
  )

  it.each([
    {},
    { installation: null },
    {
      installation: {
        ...evidence('3.1.7').installation,
        source: 'unpacked-development',
      },
    },
    {
      installation: {
        ...evidence('3.1.7').installation,
        id: 'another-extension',
      },
    },
  ])(
    'rejects evidence outside the verified store installation contract %#',
    async (invalid) => {
      const directories = await createEvidenceDirectories(
        evidence('3.1.7'),
        invalid,
      )
      await expect(readNativeStoreVersion(directories)).rejects.toThrow(
        'Native installation evidence is invalid: en',
      )
    },
  )

  it('rejects missing evidence files', async () => {
    const directories = await createEvidenceDirectories(
      evidence('3.1.7'),
      evidence('3.1.7'),
    )
    await rm(path.join(directories.en, 'native-evidence.json'))
    await expect(readNativeStoreVersion(directories)).rejects.toThrow(
      'Native recording evidence could not be read: en',
    )
  })

  it('rejects malformed evidence JSON', async () => {
    const directories = await createEvidenceDirectories(
      evidence('3.1.7'),
      evidence('3.1.7'),
    )
    await writeFile(
      path.join(directories.ja, 'native-evidence.json'),
      '{bad json',
    )
    await expect(readNativeStoreVersion(directories)).rejects.toThrow(
      'Native recording evidence could not be read: ja',
    )
  })
})
