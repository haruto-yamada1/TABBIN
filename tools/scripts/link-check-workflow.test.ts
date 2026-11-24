import { existsSync, readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const workflowPath = '.github/workflows/link-check.yml'
const config = readFileSync('lychee.toml', 'utf8')

type WorkflowStep = {
  id?: string
  uses?: string
  with?: Record<string, unknown>
}

type WorkflowJob = {
  if?: string
  steps: WorkflowStep[]
}

type Workflow = {
  jobs: Record<string, WorkflowJob>
  on: {
    pull_request?: { paths?: string[] }
    schedule?: { cron: string }[]
    workflow_dispatch?: unknown
  }
  permissions: Record<string, string>
}

// The workflow file is not on the branch yet: the GitHub App used to push
// this change has no `workflows` permission, so `.github/workflows/*`
// cannot be added through it (see PR #1104). The file is ready and its
// contract tests below activate automatically once it is added; until
// then they are skipped explicitly instead of crashing the whole suite.
const workflowExists = existsSync(workflowPath)
const workflow = workflowExists
  ? (parse(readFileSync(workflowPath, 'utf8')) as Workflow)
  : undefined

describe('lychee config contract (#1089)', () => {
  it('keeps exclusions reasoned, dated and free of the #1022 URL', () => {
    expect(config).toContain('exclude_all_private = true')
    expect(config).toContain('include_mail = false')
    expect(config).toContain('include_verbatim = false')
    expect(config).toContain('include_fragments = "anchor-only"')
    expect(config).toContain('max_retries = 2')
    expect(config).toContain('timeout = 20')
    expect(config).toContain('Review by: 2027-05-24')
    expect(config).toContain('localhost')
    // The known-broken README URL from #1022 must stay detectable:
    // no exclusion may hide a placeholder GitHub account.
    expect(config).not.toContain('yourusername')
    const excludeBlock = config.slice(config.indexOf('exclude = ['))
    expect(excludeBlock).not.toContain('github')
  })
})

describe.skipIf(!workflowExists)('link-check workflow contract (#1089)', () => {
  const wf = workflow as Workflow
  // Computed inside each test: a skipped suite still runs this callback
  // during collection, while `wf` is undefined until the file lands.
  const getAllSteps = (): WorkflowStep[] =>
    Object.values(wf.jobs).flatMap((job) => job.steps)

  it('is read-only, SHA-pinned and free of secrets or write scopes', () => {
    const allSteps = getAllSteps()
    expect(wf.permissions).toEqual({ contents: 'read' })
    expect(wf.on).not.toHaveProperty('pull_request_target')
    for (const step of allSteps.filter((item) => item.uses)) {
      expect(step.uses).toMatch(/@[0-9a-f]{40}$/)
    }
    const checkout = allSteps.find((step) =>
      step.uses?.startsWith('actions/checkout@'),
    )
    expect(checkout?.with?.['persist-credentials']).toBe(false)
    expect(JSON.stringify(wf)).not.toMatch(
      /secrets\.|issues: write|pull-requests: write/,
    )
  })

  it('pins lychee-action v2.9.0 in both jobs', () => {
    const allSteps = getAllSteps()
    const lycheeSteps = allSteps.filter((step) =>
      step.uses?.startsWith('lycheeverse/lychee-action@'),
    )
    expect(lycheeSteps).toHaveLength(2)
    for (const step of lycheeSteps) {
      // The YAML parser drops the trailing `# v2.9.0` comment.
      expect(step.uses).toBe(
        'lycheeverse/lychee-action@e7477775783ea5526144ba13e8db5eec57747ce8',
      )
    }
  })

  it('checks changed Markdown strictly and offline on pull requests', () => {
    expect(wf.on.pull_request?.paths).toContain('**/*.md')
    expect(wf.on.pull_request?.paths).toContain('lychee.toml')
    const job = wf.jobs['internal-links']
    expect(job?.if).toContain('pull_request')
    const lychee = job?.steps.find((step) => step.id === 'lychee')
    expect(lychee?.with?.fail).toBe(true)
    expect(lychee?.with?.args).toContain('--offline')
    expect(lychee?.with?.args).toContain('--config lychee.toml')
    expect(lychee?.with?.args).toContain('./docs/**/*.md')
    expect(lychee?.with?.args).toContain('./.github/**/*.md')
    expect(lychee?.with?.jobSummary).toBe(true)
  })

  it('checks external URLs weekly without failing the run', () => {
    expect(wf.on.schedule).toEqual([{ cron: '41 3 * * 1' }])
    expect(wf.on).toHaveProperty('workflow_dispatch')
    const job = wf.jobs['external-links']
    const lychee = job?.steps.find((step) => step.id === 'lychee')
    expect(lychee?.with?.fail).toBe(false)
    expect(lychee?.with?.args).not.toContain('--offline')
    expect(lychee?.with?.args).toContain('--cache')
    const artifact = job?.steps.find((step) =>
      step.uses?.startsWith('actions/upload-artifact@'),
    )
    expect(artifact?.with?.['retention-days']).toBe(30)
    expect(artifact?.with?.['if-no-files-found']).toBe('error')
  })
})
