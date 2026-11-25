import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '..', '..')
const securityPolicyPath = path.join(projectRoot, 'SECURITY.md')
const readmePath = path.join(projectRoot, 'README.md')
const issueTemplateConfigPath = path.join(
  projectRoot,
  '.github',
  'ISSUE_TEMPLATE',
  'config.yml',
)
const pullRequestTemplatePath = path.join(
  projectRoot,
  '.github',
  'PULL_REQUEST_TEMPLATE.md',
)

const PRIVATE_ADVISORY_URL =
  'https://github.com/haruto-yamada1/TABBIN/security/advisories/new'
const SECURITY_POLICY_URL =
  'https://github.com/haruto-yamada1/TABBIN/security/policy'

const readIfPresent = (filePath: string): string =>
  existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''

describe('security reporting contract', () => {
  const policy = readIfPresent(securityPolicyPath)
  const readme = readIfPresent(readmePath)
  const issueTemplateConfig = readIfPresent(issueTemplateConfigPath)
  const pullRequestTemplate = readIfPresent(pullRequestTemplatePath)

  it('publishes SECURITY.md at the repository root', () => {
    expect(existsSync(securityPolicyPath)).toBe(true)
  })

  it('routes private reports to GitHub private vulnerability reporting', () => {
    expect(policy).toContain(PRIVATE_ADVISORY_URL)
    expect(policy).not.toMatch(/mailto:/iu)
    expect(policy).not.toMatch(/security@/iu)
  })

  it('warns reporters not to publish vulnerability details', () => {
    expect(policy).toContain('公開 Issue')
    expect(policy).toContain('詳細を書かないでください')
  })

  it('separates private reports from ordinary bug reports', () => {
    expect(policy).toContain('通常の不具合')
    expect(policy).toContain('公開 Issue')
  })

  it('documents supported and unsupported versions', () => {
    expect(policy).toContain('サポート対象')
    expect(policy).toContain('サポート対象外')
  })

  it('documents the response flow with targets that are not a guarantee', () => {
    expect(policy).toContain('目安')
    expect(policy).toContain('保証しません')
  })

  it('asks reporters to withhold secrets, personal data, and real user data', () => {
    expect(policy).toContain('API キー')
    expect(policy).toContain('個人情報')
    expect(policy).toContain('新規プロファイル')
  })

  it('links the policy from README', () => {
    expect(readme).toContain('](SECURITY.md)')
  })

  it('offers the private advisory form as an issue template contact link', () => {
    expect(issueTemplateConfig).toContain('contact_links:')
    expect(issueTemplateConfig).toContain(PRIVATE_ADVISORY_URL)
  })

  it('links the policy from the pull request template', () => {
    expect(pullRequestTemplate).toContain(SECURITY_POLICY_URL)
    expect(pullRequestTemplate).not.toContain('](SECURITY.md)')
  })
})
