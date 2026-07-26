import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const readRepositoryFile = (path: string): string => readFileSync(path, 'utf8')

type RenovatePackageRule = {
  automerge?: boolean
  dependencyDashboardApproval?: boolean
  description?: string
  groupName?: string | null
  matchDatasources?: string[]
  matchManagers?: string[]
  matchPackageNames?: string[]
  matchUpdateTypes?: string[]
  minimumGroupSize?: number
  minimumReleaseAge?: string
  schedule?: string[]
}

type RenovateCustomManager = {
  customType: string
  description?: string
  managerFilePatterns: string[]
  matchStrings: string[]
  depNameTemplate: string
  packageNameTemplate?: string
  datasourceTemplate?: string
  versioningTemplate?: string
  autoReplaceStringTemplate?: string
}

type RenovateConfig = {
  enabledManagers: string[]
  packageRules: RenovatePackageRule[]
  customManagers: RenovateCustomManager[]
  postUpgradeTasks?: unknown
}

const parseJobBlocks = (workflow: string): string[][] => {
  const lines = workflow.split('\n')
  const jobs: string[][] = []
  let inJobs = false
  let currentJob: string[] = []

  for (const line of lines) {
    if (line.startsWith('jobs:')) {
      inJobs = true
      continue
    }
    if (!inJobs) {
      continue
    }
    if (/^ {2}\S+:/.test(line)) {
      if (currentJob.length > 0) {
        jobs.push(currentJob)
      }
      currentJob = [line]
    } else if (currentJob.length > 0) {
      currentJob.push(line)
    }
  }

  if (currentJob.length > 0) {
    jobs.push(currentJob)
  }

  return jobs
}

const assertVerifierBeforeInstall = (workflow: string): void => {
  const jobs = parseJobBlocks(workflow)
  expect(
    jobs.length,
    'CI workflow must contain at least one job',
  ).toBeGreaterThan(0)

  for (const job of jobs) {
    const setupBunIndex = job.findIndex((line) =>
      line.includes('uses: oven-sh/setup-bun'),
    )
    const verifierIndex = job.findIndex((line) =>
      line.includes('run: bun run verify:toolchain-versions'),
    )
    const installIndex = job.findIndex((line) =>
      line.includes('run: bun install --frozen-lockfile'),
    )

    expect(setupBunIndex, 'every job must set up Bun').toBeGreaterThanOrEqual(0)
    expect(
      verifierIndex,
      'every job must run the toolchain verifier',
    ).toBeGreaterThanOrEqual(0)
    expect(
      installIndex,
      'every job must install dependencies',
    ).toBeGreaterThanOrEqual(0)
    expect(
      verifierIndex,
      'verifier must run before frozen install',
    ).toBeLessThan(installIndex)
  }
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
    expect(nodeManager?.packageNameTemplate).toBeUndefined()
    expect(bunEnginesManager).toEqual(
      expect.objectContaining({
        customType: 'regex',
        depNameTemplate: 'bun',
        packageNameTemplate: 'bun',
        datasourceTemplate: 'npm',
        versioningTemplate: 'npm',
      }),
    )
    expect(bunPackageManager).toEqual(
      expect.objectContaining({
        customType: 'regex',
        depNameTemplate: 'bun',
        packageNameTemplate: 'bun',
        datasourceTemplate: 'npm',
        versioningTemplate: 'npm',
      }),
    )
  })

  it('matches the actual package.json engines.node value with the Node custom regex manager', () => {
    const packageJson = readRepositoryFile('package.json')
    const manager = config.customManagers.find(
      (candidate) =>
        candidate.description ===
        'Sync Node runtime version into package.json engines.node',
    )
    const match = new RegExp(manager?.matchStrings[0] ?? '').exec(packageJson)

    expect(manager?.matchStrings[0]).toContain('(?<currentValue>')
    expect(match?.groups?.currentValue).toBe('24.x')
    expect(manager?.datasourceTemplate).toBe('node-version')
    expect(manager?.versioningTemplate).toBe('node')
    expect(manager?.autoReplaceStringTemplate).toBe(
      '"node": "{{{newMajor}}}.x"',
    )
  })

  it('matches the actual package.json engines.bun value with the Bun custom regex manager', () => {
    const packageJson = readRepositoryFile('package.json')
    const manager = config.customManagers.find(
      (candidate) =>
        candidate.description ===
        'Sync Bun runtime version into package.json engines.bun',
    )
    const match = new RegExp(manager?.matchStrings[0] ?? '').exec(packageJson)

    expect(match?.groups?.currentValue).toBe('1.3.14')
    expect(manager?.datasourceTemplate).toBe('npm')
    expect(manager?.versioningTemplate).toBe('npm')
    expect(manager?.autoReplaceStringTemplate).toBe('"bun": "{{{newVersion}}}"')
  })

  it('matches the actual package.json packageManager value with the Bun custom regex manager', () => {
    const packageJson = readRepositoryFile('package.json')
    const manager = config.customManagers.find(
      (candidate) =>
        candidate.description ===
        'Sync Bun runtime version into package.json packageManager',
    )
    const match = new RegExp(manager?.matchStrings[0] ?? '').exec(packageJson)

    expect(match?.groups?.currentValue).toBe('1.3.14')
    expect(manager?.datasourceTemplate).toBe('npm')
    expect(manager?.versioningTemplate).toBe('npm')
    expect(manager?.autoReplaceStringTemplate).toBe(
      '"packageManager": "bun@{{{newVersion}}}"',
    )
  })

  it('captures currentValue in every custom manager match string', () => {
    for (const manager of config.customManagers) {
      for (const matchString of manager.matchStrings) {
        expect(matchString).toContain('(?<currentValue>')
      }
    }
  })

  it('uses only safe triple-brace templates with no zero-width characters', () => {
    for (const manager of config.customManagers) {
      const template = manager.autoReplaceStringTemplate ?? ''
      expect(template).not.toContain('&#8203;')
      expect(template).not.toContain('\u200B')
      expect(template).toMatch(/\{\{\{\w+\}\}\}/)
    }
  })

  it('groups Node and Bun runtime updates with dashboard approval, no automerge, and minimumGroupSize', () => {
    const nodeRule = config.packageRules.find(
      (rule) => rule.description === 'Group Node runtime updates',
    )
    const bunRule = config.packageRules.find(
      (rule) => rule.description === 'Group Bun runtime updates',
    )

    expect(nodeRule).toEqual({
      description: 'Group Node runtime updates',
      matchManagers: ['nodenv', 'custom.regex'],
      matchDatasources: ['node-version'],
      groupName: 'Node runtime',
      dependencyDashboardApproval: true,
      automerge: false,
      minimumGroupSize: 2,
    })
    expect(bunRule).toEqual({
      description: 'Group Bun runtime updates',
      matchManagers: ['bun-version', 'custom.regex'],
      matchDatasources: ['npm'],
      matchPackageNames: ['bun'],
      groupName: 'Bun runtime',
      dependencyDashboardApproval: true,
      automerge: false,
      minimumGroupSize: 3,
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
    expect(ciWorkflow).toContain('run: bun run verify:toolchain-versions')
    assertVerifierBeforeInstall(ciWorkflow)
  })

  it('fails when the toolchain verifier runs after dependency installation', () => {
    const reverseCiWorkflow = `
jobs:
  dummy:
    name: Dummy
    runs-on: ubuntu-latest
    steps:
      - name: Install dependencies
        run: bun install --frozen-lockfile
      - name: Verify toolchain versions
        run: bun run verify:toolchain-versions
      - name: Set up Bun
        uses: oven-sh/setup-bun@foo
        with:
          bun-version-file: '.bun-version'
    `
    expect(reverseCiWorkflow).toContain('bun install --frozen-lockfile')
    expect(() => assertVerifierBeforeInstall(reverseCiWorkflow)).toThrow(
      /verifier must run before frozen install/,
    )
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
