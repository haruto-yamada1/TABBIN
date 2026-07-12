import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { syncToolchainVersions } from './sync-toolchain-versions.ts'

const createTempProject = (packageJsonContent: unknown): string => {
  const projectRoot = mkdtempSync(path.join(tmpdir(), 'tabbin-toolchain-'))
  writeFileSync(
    path.join(projectRoot, 'package.json'),
    JSON.stringify(packageJsonContent),
  )
  return projectRoot
}

describe('syncToolchainVersions', () => {
  it('syncs Bun version from .bun-version to engines.bun and packageManager', () => {
    const packageJson = {
      engines: { node: '24.x', bun: '1.3.14' },
      packageManager: 'bun@1.3.14',
      devDependencies: { '@types/node': '^24.0.0' },
    }

    const result = syncToolchainVersions({
      projectRoot: '/tmp/dummy-bun',
      nodeVersionFile: '24',
      bunVersionFile: '1.3.15',
      packageJson,
    })

    expect(packageJson.engines.bun).toBe('1.3.15')
    expect(packageJson.packageManager).toBe('bun@1.3.15')
    expect(result.bunVersion).toBe('1.3.15')
    expect(result.updated).toContain('engines.bun: 1.3.15')
    expect(result.updated).toContain('packageManager: bun@1.3.15')
  })

  it('syncs Node major from .node-version to engines.node', () => {
    const packageJson = {
      engines: { node: '24.x', bun: '1.3.14' },
      packageManager: 'bun@1.3.14',
      devDependencies: { '@types/node': '^24.0.0' },
    }

    const result = syncToolchainVersions({
      projectRoot: '/tmp/dummy-node',
      nodeVersionFile: '26',
      bunVersionFile: '1.3.14',
      packageJson,
    })

    expect(packageJson.engines.node).toBe('26.x')
    expect(result.nodeMajor).toBe(26)
    expect(result.updated).toContain('engines.node: 26.x')
  })

  it('does not modify files when versions are already in sync', () => {
    const packageJson = {
      engines: { node: '24.x', bun: '1.3.14' },
      packageManager: 'bun@1.3.14',
      devDependencies: { '@types/node': '^24.0.0' },
    }

    const result = syncToolchainVersions({
      projectRoot: '/tmp/dummy-in-sync',
      nodeVersionFile: '24',
      bunVersionFile: '1.3.14',
      packageJson,
    })

    expect(result.updated).toEqual([])
    expect(packageJson.engines.node).toBe('24.x')
    expect(packageJson.engines.bun).toBe('1.3.14')
    expect(packageJson.packageManager).toBe('bun@1.3.14')
  })

  it('throws when .node-version is not a numeric major', () => {
    const packageJson = {
      engines: { node: '24.x', bun: '1.3.14' },
      packageManager: 'bun@1.3.14',
      devDependencies: { '@types/node': '^24.0.0' },
    }

    expect(() =>
      syncToolchainVersions({
        projectRoot: '/tmp/dummy-invalid-node',
        nodeVersionFile: 'lts/*',
        bunVersionFile: '1.3.14',
        packageJson,
      }),
    ).toThrow(/Unable to extract Node major from \.node-version: lts\/\*/)
  })

  it('throws when package.json engines is not an object', () => {
    expect(() =>
      syncToolchainVersions({
        projectRoot: '/tmp/dummy-no-engines',
        nodeVersionFile: '24',
        bunVersionFile: '1.3.14',
        packageJson: {
          packageManager: 'bun@1.3.14',
          devDependencies: { '@types/node': '^24.0.0' },
        },
      }),
    ).toThrow(/package\.json engines is not an object/)
  })

  it('throws when package.json engines.node is missing or not a string', () => {
    expect(() =>
      syncToolchainVersions({
        projectRoot: '/tmp/dummy-node-missing',
        nodeVersionFile: '24',
        bunVersionFile: '1.3.14',
        packageJson: {
          engines: { bun: '1.3.14' },
          packageManager: 'bun@1.3.14',
          devDependencies: { '@types/node': '^24.0.0' },
        },
      }),
    ).toThrow(/package\.json engines\.node is not a string/)

    expect(() =>
      syncToolchainVersions({
        projectRoot: '/tmp/dummy-node-number',
        nodeVersionFile: '24',
        bunVersionFile: '1.3.14',
        packageJson: {
          engines: { node: 24, bun: '1.3.14' },
          packageManager: 'bun@1.3.14',
          devDependencies: { '@types/node': '^24.0.0' },
        },
      }),
    ).toThrow(/package\.json engines\.node is not a string/)
  })

  it('throws when package.json engines.bun is missing or not a string', () => {
    expect(() =>
      syncToolchainVersions({
        projectRoot: '/tmp/dummy-bun-missing',
        nodeVersionFile: '24',
        bunVersionFile: '1.3.14',
        packageJson: {
          engines: { node: '24.x' },
          packageManager: 'bun@1.3.14',
          devDependencies: { '@types/node': '^24.0.0' },
        },
      }),
    ).toThrow(/package\.json engines\.bun is not a string/)

    expect(() =>
      syncToolchainVersions({
        projectRoot: '/tmp/dummy-bun-number',
        nodeVersionFile: '24',
        bunVersionFile: '1.3.14',
        packageJson: {
          engines: { node: '24.x', bun: 1.3 },
          packageManager: 'bun@1.3.14',
          devDependencies: { '@types/node': '^24.0.0' },
        },
      }),
    ).toThrow(/package\.json engines\.bun is not a string/)
  })

  it('throws when package.json packageManager is missing, not a string, or has no bun@ prefix', () => {
    expect(() =>
      syncToolchainVersions({
        projectRoot: '/tmp/dummy-package-manager-missing',
        nodeVersionFile: '24',
        bunVersionFile: '1.3.14',
        packageJson: {
          engines: { node: '24.x', bun: '1.3.14' },
          devDependencies: { '@types/node': '^24.0.0' },
        },
      }),
    ).toThrow(/package\.json packageManager is not a string/)

    expect(() =>
      syncToolchainVersions({
        projectRoot: '/tmp/dummy-package-manager-number',
        nodeVersionFile: '24',
        bunVersionFile: '1.3.14',
        packageJson: {
          engines: { node: '24.x', bun: '1.3.14' },
          packageManager: 1.3,
          devDependencies: { '@types/node': '^24.0.0' },
        },
      }),
    ).toThrow(/package\.json packageManager is not a string/)

    expect(() =>
      syncToolchainVersions({
        projectRoot: '/tmp/dummy-package-manager-prefix',
        nodeVersionFile: '24',
        bunVersionFile: '1.3.14',
        packageJson: {
          engines: { node: '24.x', bun: '1.3.14' },
          packageManager: 'npm@1.3.14',
          devDependencies: { '@types/node': '^24.0.0' },
        },
      }),
    ).toThrow(/packageManager does not use bun@ prefix: npm@1\.3\.14/)
  })

  it('throws when package.json is not a JSON object', () => {
    const projectRoot = createTempProject([])
    try {
      expect(() =>
        syncToolchainVersions({
          projectRoot,
          nodeVersionFile: '24',
          bunVersionFile: '1.3.14',
        }),
      ).toThrow(/package\.json is not a JSON object/)
    } finally {
      rmSync(projectRoot, { recursive: true, force: true })
    }
  })
})
