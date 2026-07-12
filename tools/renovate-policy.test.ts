import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

type RenovatePackageRule = {
  dependencyDashboardApproval?: boolean
  description?: string
  groupName?: string | null
  matchDatasources?: string[]
  matchPackageNames?: string[]
  minimumReleaseAge?: string
  schedule?: string[]
}

type RenovateConfig = {
  automerge: boolean
  dependencyDashboard: boolean
  dependencyDashboardOSVVulnerabilitySummary: string
  enabledManagers: string[]
  extends: string[]
  ignoreScripts: boolean
  internalChecksFilter: string
  lockFileMaintenance?: unknown
  major: { dependencyDashboardApproval: boolean }
  osvVulnerabilityAlerts: boolean
  packageRules: RenovatePackageRule[]
  prBodyNotes: string[]
  prConcurrentLimit: number
  prCreation: string
  prHourlyLimit: number
  rangeStrategy: string
  rebaseWhen: string
  schedule: string[]
  separateMajorMinor: boolean
  separateMinorPatch: boolean
  timezone: string
  vulnerabilityAlerts: {
    automerge: boolean
    enabled: boolean
    labels: string[]
    vulnerabilityFixStrategy: string
  }
}

const readRepositoryFile = (path: string) => readFileSync(path, 'utf8')

describe('Renovate dependency update policy', () => {
  it('keeps routine updates reviewable and security-sensitive updates manual', () => {
    const config = JSON.parse(
      readRepositoryFile('.github/renovate.json'),
    ) as RenovateConfig

    expect(config.enabledManagers).toEqual(['bun', 'github-actions'])
    expect(config.timezone).toBe('Asia/Tokyo')
    expect(config.schedule).toEqual(['before 6am on monday'])
    expect(config.automerge).toBe(false)
    expect(config.ignoreScripts).toBe(true)
    expect(config.rangeStrategy).toBe('pin')
    expect(config.separateMajorMinor).toBe(true)
    expect(config.separateMinorPatch).toBe(true)
    expect(config.major.dependencyDashboardApproval).toBe(true)
    expect(config.prConcurrentLimit).toBe(5)
    expect(config.prHourlyLimit).toBe(2)
    expect(config.prCreation).toBe('not-pending')
    expect(config.internalChecksFilter).toBe('strict')
    expect(config.rebaseWhen).toBe('behind-base-branch')
    expect(config.lockFileMaintenance).toBeUndefined()
  })

  it('enables dashboard, vulnerability, migration, and abandonment safeguards', () => {
    const config = JSON.parse(
      readRepositoryFile('.github/renovate.json'),
    ) as RenovateConfig

    expect(config.extends).toEqual(
      expect.arrayContaining([
        'config:recommended',
        'helpers:pinGitHubActionDigests',
        ':configMigration',
        'abandonments:recommended',
      ]),
    )
    expect(config.dependencyDashboard).toBe(true)
    expect(config.osvVulnerabilityAlerts).toBe(true)
    expect(config.dependencyDashboardOSVVulnerabilitySummary).toBe('all')
    expect(config.vulnerabilityAlerts).toEqual({
      enabled: true,
      automerge: false,
      labels: ['security'],
      vulnerabilityFixStrategy: 'lowest',
    })
    expect(config.prBodyNotes.join('\n')).toContain(
      'Dependency security review',
    )
  })

  it('waits for npm releases and isolates the TypeScript native preview', () => {
    const config = JSON.parse(
      readRepositoryFile('.github/renovate.json'),
    ) as RenovateConfig
    const npmRule = config.packageRules.find((rule) =>
      rule.matchDatasources?.includes('npm'),
    )
    const previewRule = config.packageRules.find(
      (rule) =>
        rule.description === 'Handle TypeScript native preview separately',
    )

    expect(npmRule?.minimumReleaseAge).toBe('14 days')
    expect(previewRule).toMatchObject({
      schedule: ['before 6am on the first day of the month'],
      dependencyDashboardApproval: true,
      groupName: null,
    })
  })

  it('runs a blocking high-severity Bun audit in CI', () => {
    const packageJson = JSON.parse(readRepositoryFile('package.json')) as {
      scripts: Record<string, string>
      trustedDependencies?: string[]
    }
    const ciWorkflow = readRepositoryFile('.github/workflows/ci.yml')

    expect(packageJson.scripts['security:audit']).toMatch(
      /^bun audit --audit-level=high(?: --ignore GHSA-[\w-]+)*$/,
    )
    expect(packageJson.trustedDependencies).toEqual(expect.any(Array))
    expect(ciWorkflow).toContain('run: bun run security:audit')
  })

  it('documents every temporary audit exception with an expiry date', () => {
    const packageJson = JSON.parse(readRepositoryFile('package.json')) as {
      scripts: Record<string, string>
    }
    const policy = readRepositoryFile('docs/maintenance/dependency-updates.md')
    const ignoredAdvisories = [
      ...packageJson.scripts['security:audit'].matchAll(
        /--ignore (GHSA-[\w-]+)/g,
      ),
    ].map(([, advisory]) => advisory)

    expect(ignoredAdvisories.length).toBeGreaterThan(0)
    for (const advisory of ignoredAdvisories) {
      expect(policy).toContain(advisory)
    }
    expect(policy).toContain('期限: 2026-08-12')
  })

  it('pins external Actions and leaves Renovate branch updates to Renovate', () => {
    const workflowPaths = [
      '.github/workflows/ci.yml',
      '.github/workflows/react-doctor.yml',
      '.github/workflows/update-pr-branches.yml',
    ]
    const workflows = workflowPaths.map(readRepositoryFile).join('\n')
    const externalActionReferences = [
      ...workflows.matchAll(/uses: ([^\s@]+)@([^\s]+)/g),
    ]

    expect(externalActionReferences.length).toBeGreaterThan(0)
    for (const [, action, reference] of externalActionReferences) {
      expect(reference, `${action} must use a full commit SHA`).toMatch(
        /^[0-9a-f]{40}$/,
      )
    }

    const updateWorkflow = readRepositoryFile(
      '.github/workflows/update-pr-branches.yml',
    )
    expect(updateWorkflow).toContain("pull.user.login === 'renovate[bot]'")
    expect(updateWorkflow).toContain("pull.head.ref.startsWith('renovate/')")
  })
})
