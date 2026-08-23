import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

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

const inspectTemporaryAuditExceptionExpiries = (
  policy: string,
  ignoredAdvisories: string[],
) => {
  const sectionStart = policy.indexOf('## Temporary audit exceptions')
  const sectionEnd =
    sectionStart < 0 ? -1 : policy.indexOf('\n## ', sectionStart + 1)
  const section =
    sectionStart < 0
      ? ''
      : policy.slice(sectionStart, sectionEnd < 0 ? policy.length : sectionEnd)
  const sectionLines = section.split(/\r?\n/)
  const expiryDates = ignoredAdvisories.flatMap((advisory) => {
    const recordStart = sectionLines.findIndex(
      (line) => line.startsWith('- ') && line.includes(advisory),
    )

    if (recordStart < 0) {
      return []
    }

    const nextRecordOffset = sectionLines
      .slice(recordStart + 1)
      .findIndex((line) => line.startsWith('- '))
    const recordEnd =
      nextRecordOffset < 0
        ? sectionLines.length
        : recordStart + 1 + nextRecordOffset
    const record = sectionLines.slice(recordStart, recordEnd).join('\n')
    const expiryDate = /期限: (\d{4}-\d{2}-\d{2})/.exec(record)?.[1]

    return expiryDate ? [expiryDate] : []
  })

  return {
    complete: expiryDates.length === ignoredAdvisories.length,
    expiryDates,
  }
}

describe('Renovate dependency update policy', () => {
  it('keeps routine updates reviewable and security-sensitive updates manual', () => {
    const config = JSON.parse(
      readRepositoryFile('.github/renovate.json'),
    ) as RenovateConfig

    expect(config.enabledManagers).toEqual([
      'bun',
      'bun-version',
      'custom.regex',
      'github-actions',
      'nodenv',
    ])
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

  it('documents temporary audit exception state and rejects expired deadlines', () => {
    const packageJson = JSON.parse(readRepositoryFile('package.json')) as {
      scripts: Record<string, string>
    }
    const policy = readRepositoryFile('docs/maintenance/dependency-updates.md')
    const ignoredAdvisories = [
      ...packageJson.scripts['security:audit'].matchAll(
        /--ignore (GHSA-[\w-]+)/g,
      ),
    ].map(([, advisory]) => advisory)

    const requiredPolicyMarkers =
      ignoredAdvisories.length === 0
        ? ['継続する temporary exception はなく']
        : ignoredAdvisories

    for (const marker of requiredPolicyMarkers) {
      expect(policy).toContain(marker)
    }

    const expiryInspection = inspectTemporaryAuditExceptionExpiries(
      policy,
      ignoredAdvisories,
    )

    expect(expiryInspection.complete).toBe(true)
    for (const expiryDate of expiryInspection.expiryDates) {
      const expiryEnd = Date.parse(`${expiryDate}T23:59:59+09:00`)

      expect(expiryEnd).toBeGreaterThanOrEqual(Date.now())
    }
  })

  it('requires each ignored advisory to own its expiry date', () => {
    const ignoredAdvisories = ['GHSA-aaaa-bbbb-cccc', 'GHSA-dddd-eeee-ffff']
    const policy = [
      '## Unrelated maintenance deadline',
      '期限: 2099-12-31',
      '## Temporary audit exceptions',
      '- `GHSA-aaaa-bbbb-cccc`: first exception',
      '  期限: 2099-12-31',
      '- `GHSA-dddd-eeee-ffff`: second exception without an expiry',
    ].join('\n')

    expect(
      inspectTemporaryAuditExceptionExpiries(policy, ignoredAdvisories)
        .complete,
    ).toBe(false)
  })

  it('collects one expiry date from each ignored advisory record', () => {
    const ignoredAdvisories = ['GHSA-aaaa-bbbb-cccc', 'GHSA-dddd-eeee-ffff']
    const policy = [
      '## Temporary audit exceptions',
      '- `GHSA-aaaa-bbbb-cccc`: first exception',
      '  期限: 2099-12-30',
      '- `GHSA-dddd-eeee-ffff`: second exception',
      '  期限: 2099-12-31',
      '## Unrelated maintenance deadline',
      '期限: 2000-01-01',
    ].join('\n')

    expect(
      inspectTemporaryAuditExceptionExpiries(policy, ignoredAdvisories),
    ).toEqual({
      complete: true,
      expiryDates: ['2099-12-30', '2099-12-31'],
    })
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

  it('requires dashboard approval and disables automerge for Node and Bun runtime updates', () => {
    const config = JSON.parse(
      readRepositoryFile('.github/renovate.json'),
    ) as RenovateConfig
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

  it('does not persist credentials in checkout steps', () => {
    const workflowPaths = [
      '.github/workflows/ci.yml',
      '.github/workflows/react-doctor.yml',
    ]
    const checkoutSteps = workflowPaths.flatMap((path) =>
      readRepositoryFile(path)
        .split('- uses: actions/checkout@')
        .slice(1)
        .map((section) => section.split('\n      - ')[0]),
    )

    expect(checkoutSteps).toHaveLength(9)
    for (const checkoutStep of checkoutSteps) {
      expect(checkoutStep).toContain('persist-credentials: false')
    }
  })
})
