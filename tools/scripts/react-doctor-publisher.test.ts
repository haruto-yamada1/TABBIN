import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

import { describe, expect, it, vi } from 'vitest'
import { parse } from 'yaml'

const workflow = parse(
  readFileSync('.github/workflows/react-doctor.yml', 'utf8'),
)
const script: string = workflow.jobs['publish-review'].steps[0].with.script
const marker = '<!-- react-doctor:review -->'

const diagnostic = {
  path: 'src/App.tsx',
  line: 2,
  plugin: 'react-doctor',
  rule: 'fixture',
  severity: 'warning',
  message: 'Fix this issue',
}

async function publish(
  options: { stale?: boolean; denied?: boolean; diagnostics?: unknown[] } = {},
) {
  const old = [
    {
      id: 10,
      user: { type: 'Bot' },
      body: `${marker}\nold`,
      path: 'src/App.tsx',
      line: 2,
    },
  ]
  const issues = {
    listComments: vi.fn(),
    createComment: vi.fn(async () => {
      if (options.denied) {
        throw Object.assign(new Error('denied'), { status: 403 })
      }
      return {}
    }),
    updateComment: vi.fn(async () => ({})),
  }
  const pulls = {
    get: vi.fn(async () => ({
      data: { head: { sha: options.stale ? 'new' : 'head' } },
    })),
    listFiles: vi.fn(),
    listReviewComments: vi.fn(),
    createReview: vi.fn(async (_request: unknown) => ({})),
    deleteReviewComment: vi.fn(async () => ({})),
  }
  const github = {
    rest: { issues, pulls },
    paginate: vi.fn(async (route) => {
      if (route === pulls.listFiles) {
        return [
          { filename: 'src/App.tsx', patch: '@@ -1,2 +1,2 @@\n old\n+new' },
        ]
      }
      if (route === pulls.listReviewComments) {
        return old
      }
      return []
    }),
  }
  const core = { notice: vi.fn(), warning: vi.fn() }
  await runInNewContext(`(async () => {${script}\n})()`, {
    github,
    core,
    context: {
      repo: { owner: 'owner', repo: 'repo' },
      payload: { pull_request: { number: 1, head: { sha: 'head' } } },
    },
    process: {
      env: {
        SCAN_RESULT: 'success',
        DOCTOR_REVIEW_JSON: JSON.stringify({
          score: 99,
          errorCount: 0,
          warningCount: 1,
          diagnostics: options.diagnostics ?? [diagnostic],
        }),
      },
    },
  })
  return { github, core }
}

describe('isolated React Doctor review publisher', () => {
  it('binds reviews to the analyzed revision and replaces old inline findings', async () => {
    const { github } = await publish()
    expect(github.rest.issues.createComment).toHaveBeenCalledOnce()
    expect(github.rest.pulls.createReview).toHaveBeenCalledWith(
      expect.objectContaining({
        commit_id: 'head',
        comments: [
          expect.objectContaining({
            path: 'src/App.tsx',
            line: 2,
            side: 'RIGHT',
          }),
        ],
      }),
    )
    expect(github.rest.pulls.deleteReviewComment).toHaveBeenCalledWith(
      expect.objectContaining({ comment_id: 10 }),
    )
  })

  it('does not publish stale results', async () => {
    const { github, core } = await publish({ stale: true })
    expect(core.notice).toHaveBeenCalledOnce()
    expect(github.rest.issues.createComment).not.toHaveBeenCalled()
    expect(github.rest.pulls.createReview).not.toHaveBeenCalled()
  })

  it('only annotates changed lines and prevents mentions or Markdown fence injection', async () => {
    const { github } = await publish({
      diagnostics: [
        { ...diagnostic, path: '../outside.ts' },
        { ...diagnostic, line: 99 },
        { ...diagnostic, message: '```\n@everyone' },
      ],
    })
    const call = github.rest.pulls.createReview.mock.calls[0]?.[0]
    expect(call).toEqual(
      expect.objectContaining({
        comments: [
          expect.objectContaining({
            body: expect.stringContaining('ˋˋˋ\n＠everyone'),
          }),
        ],
      }),
    )
  })

  it('treats a read-only fork token as a publishing limitation without altering the scan gate', async () => {
    const { github, core } = await publish({ denied: true })
    expect(core.warning).toHaveBeenCalledOnce()
    expect(github.rest.pulls.deleteReviewComment).not.toHaveBeenCalled()
  })
})
