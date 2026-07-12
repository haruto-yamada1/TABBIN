import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import * as CDX from '@cyclonedx/cyclonedx-library'
import { describe, expect, it } from 'vitest'

import {
  extractLicense,
  extractNameAndVersion,
  generateBuildMetadata,
  generateReleaseProvenance,
  generateSbom,
  parseBunLockPackages,
} from './generate-release-provenance.ts'

const createTempProject = (contents: {
  packageJson?: Record<string, unknown>
  bunLock?: Record<string, unknown>
  nodeVersion?: string
  bunVersion?: string
}): string => {
  const projectRoot = mkdtempSync(
    path.join(tmpdir(), 'tabbin-release-provenance-'),
  )
  writeFileSync(
    path.join(projectRoot, 'package.json'),
    JSON.stringify(
      contents.packageJson ?? { name: 'tabbin', version: '2.0.7' },
    ),
  )
  writeFileSync(
    path.join(projectRoot, 'bun.lock'),
    JSON.stringify(contents.bunLock ?? { lockfileVersion: 1, packages: {} }),
  )
  writeFileSync(
    path.join(projectRoot, '.node-version'),
    contents.nodeVersion ?? '24',
  )
  writeFileSync(
    path.join(projectRoot, '.bun-version'),
    contents.bunVersion ?? '1.3.14',
  )
  return projectRoot
}

describe('extractNameAndVersion', () => {
  it('parses an unscoped package reference', () => {
    expect(extractNameAndVersion('react@19.2.7')).toEqual({
      name: 'react',
      version: '19.2.7',
    })
  })

  it('parses a scoped package reference', () => {
    expect(extractNameAndVersion('@types/node@24.0.0')).toEqual({
      name: '@types/node',
      version: '24.0.0',
    })
  })

  it('throws for an invalid reference', () => {
    expect(() => extractNameAndVersion('invalid')).toThrow(
      /Unable to parse package reference/,
    )
  })
})

describe('extractLicense', () => {
  it('returns an SPDX license for a known SPDX id', () => {
    const license = extractLicense({ license: 'MIT' })
    expect(license).toBeInstanceOf(CDX.Models.SpdxLicense)
  })

  it('returns a named license for an unknown string', () => {
    const license = extractLicense({ license: 'Custom License' })
    expect(license).toBeInstanceOf(CDX.Models.NamedLicense)
  })

  it('joins legacy license array with OR', () => {
    const license = extractLicense({
      licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }],
    })
    expect(license).toBeInstanceOf(CDX.Models.LicenseExpression)
    expect((license as CDX.Models.LicenseExpression).expression).toBe(
      'MIT OR Apache-2.0',
    )
  })

  it('returns NOASSERTION when license is missing', () => {
    const license = extractLicense({})
    expect(license).toBeInstanceOf(CDX.Models.LicenseExpression)
    expect((license as CDX.Models.LicenseExpression).expression).toBe(
      'NOASSERTION',
    )
  })
})

describe('parseBunLockPackages', () => {
  it('deduplicates packages by resolved name and version', () => {
    const packages = parseBunLockPackages(
      {
        lockfileVersion: 1,
        packages: {
          react: ['react@18.3.1', '', {}, 'sha512-aaaa'],
          'nested/react': ['react@18.3.1', '', {}, 'sha512-aaaa'],
          'react-dom': ['react-dom@18.3.1', '', {}, 'sha512-bbbb'],
        },
      },
      new Set(['react', 'react-dom']),
    )

    expect(packages).toHaveLength(2)
    expect(packages.map((p) => p.name).toSorted()).toEqual([
      'react',
      'react-dom',
    ])
  })

  it('skips malformed package entries', () => {
    const packages = parseBunLockPackages(
      {
        lockfileVersion: 1,
        packages: {
          bad: ['not-a-version'],
        },
      },
      new Set(),
    )

    expect(packages).toHaveLength(0)
  })
})

describe('generateBuildMetadata', () => {
  it('finds zip artifacts and records their sha256', () => {
    const projectRoot = mkdtempSync(
      path.join(tmpdir(), 'tabbin-release-provenance-zip-'),
    )
    const outputDir = path.join(projectRoot, '.output')
    mkdirSync(outputDir, { recursive: true })
    writeFileSync(path.join(outputDir, 'tabbin-2.0.7-chrome.zip'), 'chrome-zip')
    writeFileSync(
      path.join(outputDir, 'tabbin-2.0.7-firefox.zip'),
      'firefox-zip',
    )

    const metadata = generateBuildMetadata({
      appName: 'tabbin',
      appVersion: '2.0.7',
      gitSha: 'abc123',
      nodeVersion: '24',
      bunVersion: '1.3.14',
      buildTimestamp: '2026-07-12T09:00:00.000Z',
      bunLockSha256: 'lockhash',
      outputDir,
    })

    expect(metadata.artifacts).toHaveLength(2)
    expect(metadata.artifacts.map((a) => a.browser).toSorted()).toEqual([
      'chrome',
      'firefox',
    ])
    expect(metadata.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          browser: 'chrome',
          fileName: 'tabbin-2.0.7-chrome.zip',
          sha256: createHash('sha256').update('chrome-zip').digest('hex'),
        }),
        expect.objectContaining({
          browser: 'firefox',
          fileName: 'tabbin-2.0.7-firefox.zip',
          sha256: createHash('sha256').update('firefox-zip').digest('hex'),
        }),
      ]),
    )
    expect(metadata.sbom).toEqual({
      fileName: 'tabbin-2.0.7-sbom.cdx.json',
      format: 'CycloneDX',
      specVersion: '1.6',
    })
  })
})

describe('generateSbom', () => {
  it('produces a CycloneDX BOM with an application component and dependencies', () => {
    const projectRoot = createTempProject({
      packageJson: { name: 'tabbin', version: '2.0.7' },
    })
    mkdirSync(path.join(projectRoot, 'node_modules', 'react'), {
      recursive: true,
    })
    mkdirSync(path.join(projectRoot, 'node_modules', 'react'), {
      recursive: true,
    })
    writeFileSync(
      path.join(projectRoot, 'node_modules', 'react', 'package.json'),
      JSON.stringify({ name: 'react', version: '18.3.1', license: 'MIT' }),
    )

    const bom = generateSbom({
      appName: 'tabbin',
      appVersion: '2.0.7',
      packages: [
        {
          name: 'react',
          version: '18.3.1',
          integrity: 'sha512-aaaa',
          metadata: {},
          isProduction: true,
        },
      ],
      projectRoot,
      gitSha: 'abc123',
      buildTimestamp: '2026-07-12T09:00:00.000Z',
    })

    expect(bom.metadata.component?.name).toBe('tabbin')
    expect(bom.metadata.component?.version).toBe('2.0.7')
    expect(Array.from(bom.components)).toHaveLength(1)
    expect(Array.from(bom.components)[0]?.name).toBe('react')
  })
})

describe('generateReleaseProvenance', () => {
  it('generates metadata and SBOM from project files', () => {
    const projectRoot = createTempProject({
      packageJson: { name: 'tabbin', version: '2.0.7' },
      bunLock: {
        lockfileVersion: 1,
        packages: {
          react: ['react@18.3.1', '', { dependencies: {} }, 'sha512-aaaa'],
          'react-dom': ['react-dom@18.3.1', '', {}, 'sha512-bbbb'],
        },
      },
    })
    mkdirSync(path.join(projectRoot, 'node_modules', 'react'), {
      recursive: true,
    })
    writeFileSync(
      path.join(projectRoot, 'node_modules', 'react', 'package.json'),
      JSON.stringify({ name: 'react', version: '18.3.1', license: 'MIT' }),
    )

    const { metadata, sbomJson } = generateReleaseProvenance({
      projectRoot,
      outputDir: path.join(projectRoot, '.output'),
      gitSha: 'abc123def456',
      buildTimestamp: '2026-07-12T09:00:00.000Z',
    })

    expect(metadata.appName).toBe('tabbin')
    expect(metadata.appVersion).toBe('2.0.7')
    expect(metadata.gitSha).toBe('abc123def456')
    expect(metadata.bunLockSha256).toHaveLength(64)
    expect(metadata.artifacts).toHaveLength(0)
    expect(metadata.sbom.format).toBe('CycloneDX')

    const sbom = JSON.parse(sbomJson)
    expect(sbom.bomFormat).toBe('CycloneDX')
    expect(sbom.specVersion).toBe('1.6')
    expect(sbom.metadata.component.name).toBe('tabbin')
  })
})
