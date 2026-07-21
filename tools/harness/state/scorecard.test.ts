import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { collectAgentContextFindings } from './scorecard'

const createProject = (): string =>
  mkdtempSync(path.join(tmpdir(), 'tabbin-scorecard-'))

const writeSkill = (
  projectRoot: string,
  name: string,
  frontmatter: string,
  body = '# skill\n',
): void => {
  const skillPath = path.join(projectRoot, `.apm/skills/${name}/SKILL.md`)
  mkdirSync(path.dirname(skillPath), { recursive: true })
  writeFileSync(skillPath, `---\n${frontmatter}\n---\n${body}`)
}

describe('collectAgentContextFindings — strengthened agent context health', () => {
  it('reports AGENTS.md size with bytes, lines, and token measurements', () => {
    const projectRoot = createProject()
    writeFileSync(
      path.join(projectRoot, 'AGENTS.md'),
      `${'x'.repeat(41_000)}\n`,
    )

    const findings = collectAgentContextFindings(projectRoot)

    expect(findings).toEqual([
      expect.stringMatching(/AGENTS.md が \d+ bytes \/ \d+ 行 \/ ~\d+ tokens/),
    ])
  })

  it('flags a side-effect skill missing disable-model-invocation via parsed frontmatter', () => {
    const projectRoot = createProject()
    writeSkill(projectRoot, 'commit-push-pr', 'name: commit-push-pr')

    const findings = collectAgentContextFindings(projectRoot)

    expect(findings).toContain(
      '.apm/skills/commit-push-pr/SKILL.md: 副作用 Skill に disable-model-invocation: true がありません。',
    )
  })

  it('does not flag a side-effect skill when disable-model-invocation is true in frontmatter', () => {
    const projectRoot = createProject()
    writeSkill(
      projectRoot,
      'commit-push-pr',
      'name: commit-push-pr\ndisable-model-invocation: true',
    )

    const findings = collectAgentContextFindings(projectRoot)

    expect(
      findings.some((finding) =>
        finding.includes('disable-model-invocation: true がありません'),
      ),
    ).toBe(false)
  })

  it('is not satisfied by disable-model-invocation mentioned only in the body', () => {
    const projectRoot = createProject()
    writeSkill(
      projectRoot,
      'create-skill',
      'name: create-skill',
      '# skill\nmentions disable-model-invocation: true in prose only\n',
    )

    const findings = collectAgentContextFindings(projectRoot)

    expect(findings).toContain(
      '.apm/skills/create-skill/SKILL.md: 副作用 Skill に disable-model-invocation: true がありません。',
    )
  })

  it('flags a skill script reference that does not exist in package.json', () => {
    const projectRoot = createProject()
    writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({ scripts: { 'quality:check': 'echo ok' } }),
    )
    writeSkill(
      projectRoot,
      'demo-skill',
      'name: demo-skill',
      '# skill\nrun `bun run does-not-exist` after changes\n',
    )

    const findings = collectAgentContextFindings(projectRoot)

    expect(findings.join('\n')).toContain('参照する package script')
    expect(findings.join('\n')).toContain('does-not-exist')
  })

  it('flags a frontmatter name that does not match the skill directory', () => {
    const projectRoot = createProject()
    writeSkill(
      projectRoot,
      'commit-push-pr',
      'name: wrong-name\ndisable-model-invocation: true',
    )

    const findings = collectAgentContextFindings(projectRoot)

    expect(findings.join('\n')).toContain(
      'frontmatter name "wrong-name" がディレクトリ名と不一致',
    )
  })
})
