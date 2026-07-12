import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const readRepositoryFile = (path: string): string => readFileSync(path, 'utf8')

type RenovateConfig = {
  enabledManagers: string[]
  packageRules: {
    description?: string
    matchManagers?: string[]
    dependencyDashboardApproval?: boolean
    groupName?: string | null
    automerge?: boolean
    matchPackageNames?: string[]
  }[]
  customManagers: {
    description?: string
    customType: string
    fileMatch: string[]
    matchStrings: string[]
    depNameTemplate: string
    packageNameTemplate?: string
    datasourceTemplate?: string
    versioningTemplate?: string
    extractVersionTemplate?: string
    autoReplaceStringTemplate?: string
  }[]
}

describe('Renovate toolchain update automation policy', () => {
  const config = JSON.parse(
    readRepositoryFile('.github/renovate.json'),
  ) as RenovateConfig

  it('enables custom regex manager for package.json sync', () => {
    expect(config.enabledManagers).toContain('custom.regex')
  })

  it('uses Renovate native managers for version files and custom regex managers for package.json sync', () => {
    expect(config.enabledManagers).toEqual(
      expect.arrayContaining(['bun-version', 'custom.regex', 'nodenv']),
    )

    const nodeManager = config.customManagers.find(
      (manager) =>
        manager.description ===
        'Sync Node runtime version into package.json engines.node',
    )
    const bunEnginesManager = config.customManagers.find(
      (manager) =>
        manager.description ===
        'Sync Bun runtime version into package.json engines.bun',
    )
    const bunPackageManager = config.customManagers.find(
      (manager) =>
        manager.description ===
        'Sync Bun runtime version into package.json packageManager',
    )

    expect(nodeManager).toEqual(
      expect.objectContaining({
        customType: 'regex',
        depNameTemplate: 'node',
        datasourceTemplate: 'node-version',
        versioningTemplate: 'node',
      }),
    )
    expect(bunEnginesManager).toEqual(
      expect.objectContaining({
        customType: 'regex',
        depNameTemplate: 'bun',
        datasourceTemplate: 'github-releases',
        versioningTemplate: 'semver',
      }),
    )
    expect(bunPackageManager).toEqual(
      expect.objectContaining({
        customType: 'regex',
        depNameTemplate: 'bun',
        datasourceTemplate: 'github-releases',
        versioningTemplate: 'semver',
      }),
    )
  })

  it('captures currentValue in every custom manager match string', () => {
    for (const manager of config.customManagers) {
      for (const matchString of manager.matchStrings) {
        expect(matchString).toContain('(?<currentValue>')
      }
    }
  })

  it('keeps Node and Bun runtime updates in separate PRs with dashboard approval and no automerge', () => {
    const nodeRule = config.packageRules.find(
      (rule) =>
        rule.description === 'Require approval for Node runtime updates',
    )
    const bunRule = config.packageRules.find(
      (rule) => rule.description === 'Require approval for Bun runtime updates',
    )

    expect(nodeRule).toEqual({
      description: 'Require approval for Node runtime updates',
      matchManagers: ['nodenv'],
      dependencyDashboardApproval: true,
      groupName: null,
      automerge: false,
    })
    expect(bunRule).toEqual({
      description: 'Require approval for Bun runtime updates',
      matchManagers: ['bun-version'],
      dependencyDashboardApproval: true,
      groupName: null,
      automerge: false,
    })
  })

  it('does not rely on postUpgradeTasks for package metadata sync', () => {
    expect(config).not.toHaveProperty('postUpgradeTasks')
  })

  it('does not rely on a write-capable sync workflow for package metadata sync', () => {
    expect(() =>
      readRepositoryFile('.github/workflows/sync-renovate-toolchain.yml'),
    ).toThrow('ENOENT')
  })

  it('runs verify:toolchain-versions in CI for every job before installing dependencies', () => {
    const ciWorkflow = readRepositoryFile('.github/workflows/ci.yml')
    const setupBunLines = ciWorkflow
      .split('\n')
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => line.includes('bun-version-file:'))

    expect(setupBunLines.length).toBeGreaterThan(0)
    for (const { index } of setupBunLines) {
      const followingLines = ciWorkflow.split('\n').slice(index + 1, index + 10)
      const hasVerifier = followingLines.some((line) =>
        line.includes('run: bun run verify:toolchain-versions'),
      )
      expect(hasVerifier).toBe(true)
    }
  })

  it('matches all required package.json version sources for runtime sync', () => {
    const descriptions = config.customManagers.map(
      (manager) => manager.description,
    )
    expect(descriptions).toContain(
      'Sync Node runtime version into package.json engines.node',
    )
    expect(descriptions).toContain(
      'Sync Bun runtime version into package.json engines.bun',
    )
    expect(descriptions).toContain(
      'Sync Bun runtime version into package.json packageManager',
    )
  })
})
