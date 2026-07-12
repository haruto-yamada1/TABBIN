import { describe, expect, it } from 'vitest'

import { syncToolchainVersions } from './sync-toolchain-versions.ts'

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
})
