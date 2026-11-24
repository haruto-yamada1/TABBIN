import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

const workflowPath = '.github/workflows/link-check.yml'
const workflow = parse(readFileSync(workflowPath, 'utf8'))
const config = readFileSync('lychee.toml', 'utf8')

const allSteps = Object.values(workflow.jobs).flatMap(
  (job: { steps: unknown[] }) => job.steps,
) as { uses?: string; with?: Record<string, unknown> }[]

describe('lychee link check contract (#1089)', () => {
  it('is read-only, SHA-pinned and free of secrets or write scopes', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' })
    expect(workflow.on.pull_request_target).toBeUndefined()
    for (const step of allSteps.filter((item) => item.uses)) {
      expect(step.uses).toMatch(/@[0-9a-f]{40}$/)
    }
    const checkout = allSteps.find((step) =>
      step.uses?.startsWith('actions/checkout@'),
    )
    expect(checkout?.with?.['persist-credentials']).toBe(false)
    expect(JSON.stringify(workflow)).not.toMatch(
      /secrets\.|issues: write|pull-requests: write/,
    )
  })

  it('pins lychee-action v2.9.0 in both jobs', () => {
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
    expect(workflow.on.pull_request.paths).toContain('**/*.md')
    expect(workflow.on.pull_request.paths).toContain('lychee.toml')
    const job = workflow.jobs['internal-links']
    expect(job.if).toContain('pull_request')
    const lychee = job.steps.find(
      (step: { id?: string }) => step.id === 'lychee',
    )
    expect(lychee.with.fail).toBe(true)
    expect(lychee.with.args).toContain('--offline')
    expect(lychee.with.args).toContain('--config lychee.toml')
    expect(lychee.with.args).toContain('./docs/**/*.md')
    expect(lychee.with.args).toContain('./.github/**/*.md')
    expect(lychee.with.jobSummary).toBe(true)
  })

  it('checks external URLs weekly without failing the run', () => {
    expect(workflow.on.schedule).toEqual([{ cron: '41 3 * * 1' }])
    expect(workflow.on).toHaveProperty('workflow_dispatch')
    const job = workflow.jobs['external-links']
    const lychee = job.steps.find(
      (step: { id?: string }) => step.id === 'lychee',
    )
    expect(lychee.with.fail).toBe(false)
    expect(lychee.with.args).not.toContain('--offline')
    expect(lychee.with.args).toContain('--cache')
    const artifact = job.steps.find((step: { uses?: string }) =>
      step.uses?.startsWith('actions/upload-artifact@'),
    )
    expect(artifact.with['retention-days']).toBe(30)
    expect(artifact.with['if-no-files-found']).toBe('error')
  })

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
