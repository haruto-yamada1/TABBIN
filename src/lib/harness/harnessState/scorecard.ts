import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { collectSecurityFindings } from './learning'
import {
  LINE_PREFIX_OFFSET,
  SCORE_PASSED,
  SCORE_REVIEW,
  TOP_ACTIONS_DISPLAY_LIMIT,
} from './types'
import type { ScorecardRecord, SecurityFinding } from './types'

function surfaceAuditCategoryNames() {
  return [
    'Tool Coverage',
    'Context Efficiency',
    'Quality Gates',
    'Memory Persistence',
    'Eval Coverage',
    'Security Guardrails',
    'Source-of-truth Sync',
    'Cost Efficiency',
    'GitHub Integration',
  ]
}

function buildSurfaceAuditCategories(projectRoot: string): ScorecardRecord[] {
  const scriptNames = readPackageScriptNames(projectRoot)
  const sourceFindings = collectSourceOfTruthFindings(projectRoot)
  const securityFindings = collectSecurityFindings(projectRoot)
  const checks: Record<string, { evidence: string; ok: boolean }> = {
    'Tool Coverage': {
      ok:
        existsSync(path.join(projectRoot, '.apm/skills/harness-planner')) &&
        existsSync(path.join(projectRoot, '.apm/skills/harness-evaluator')),
      evidence: '.apm/skills/harness-*',
    },
    'Context Efficiency': {
      ok: existsSync(
        path.join(
          projectRoot,
          '.apm/instructions/00-context-mode.instructions.md',
        ),
      ),
      evidence: '.apm/instructions/00-context-mode.instructions.md',
    },
    'Quality Gates': {
      ok:
        scriptNames.includes('harness:validate') &&
        scriptNames.includes('harness:surface-audit') &&
        scriptNames.includes('harness:security-audit') &&
        scriptNames.includes('harness:repo-status'),
      evidence: 'package.json scripts',
    },
    'Memory Persistence': {
      ok: existsSync(
        path.join(projectRoot, '.apm/hooks/scripts/harness-precompact.sh'),
      ),
      evidence: '.apm/hooks/scripts/harness-precompact.sh',
    },
    'Eval Coverage': {
      ok:
        existsSync(
          path.join(projectRoot, '.apm/prompts/harness-evaluator.prompt.md'),
        ) && scriptNames.includes('harness:evaluate'),
      evidence: '.apm/prompts/harness-evaluator.prompt.md',
    },
    'Security Guardrails': {
      ok:
        securityFindings.length === 0 &&
        existsSync(
          path.join(projectRoot, '.apm/hooks/scripts/harness-safety-warn.sh'),
        ) &&
        existsSync(
          path.join(
            projectRoot,
            '.apm/hooks/scripts/harness-config-protection.sh',
          ),
        ),
      evidence: '.apm/hooks/scripts/harness-safety-warn.sh',
    },
    'Source-of-truth Sync': {
      ok: sourceFindings.length === 0,
      evidence: '.apm source と generated surfaces',
    },
    'Cost Efficiency': {
      ok:
        existsSync(
          path.join(projectRoot, '.apm/instructions/01-rtk.instructions.md'),
        ) &&
        existsSync(
          path.join(
            projectRoot,
            '.apm/instructions/00-context-mode.instructions.md',
          ),
        ),
      evidence: 'context-mode / RTK routing',
    },
    'GitHub Integration': {
      ok:
        existsSync(path.join(projectRoot, '.github/workflows')) ||
        existsSync(path.join(projectRoot, '.github/instructions')),
      evidence: '.github/workflows または .github/instructions',
    },
  }

  return surfaceAuditCategoryNames().map((name) => {
    const check = checks[name]
    const findings = findingsForCategory(name, sourceFindings, securityFindings)
    const ok = check.ok
    return {
      name,
      status: ok ? 'covered' : 'review',
      evidence: check.evidence,
      notes: ok ? 'deterministic check passed' : '確認または同期が必要です。',
      score: ok ? SCORE_PASSED : SCORE_REVIEW,
      max_score: SCORE_PASSED,
      findings,
    }
  })
}

function summarizeScore(categories: ScorecardRecord[]) {
  const overallScore = categories.reduce(
    (total, category) => total + (category.score ?? 0),
    0,
  )
  const maxScore = categories.reduce(
    (total, category) => total + (category.max_score ?? SCORE_PASSED),
    0,
  )
  return { maxScore, overallScore }
}

function topActionLines(
  categories: ScorecardRecord[],
  extraFindings: (SecurityFinding | string)[] = [],
) {
  const categoryActions = categories
    .filter(
      (category) =>
        (category.score ?? 0) < (category.max_score ?? SCORE_PASSED),
    )
    .map(
      (category) =>
        `[${category.name}] ${category.evidence} を確認し、source-of-truth から不足を補う。`,
    )
  const extraActions = extraFindings.map((finding) => {
    if (typeof finding === 'string') {
      return `[Source-of-truth Sync] ${finding}`
    }
    return `[Security Guardrails] ${finding.file}: ${finding.summary}`
  })
  return [...categoryActions, ...extraActions].slice(
    0,
    TOP_ACTIONS_DISPLAY_LIMIT,
  )
}

function findingsForCategory(
  name: string,
  sourceFindings: string[],
  securityFindings: SecurityFinding[],
) {
  if (name === 'Source-of-truth Sync') {
    return sourceFindings
  }
  if (name === 'Security Guardrails') {
    return securityFindings.map(
      (finding) => `${finding.file}: ${finding.summary}`,
    )
  }
  return []
}

function readPackageScriptNames(projectRoot: string) {
  const packageJsonPath = path.join(projectRoot, 'package.json')
  if (!existsSync(packageJsonPath)) {
    return []
  }

  try {
    const raw: unknown = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    const packageJson: { scripts?: Record<string, string> } =
      raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
    return Object.keys(packageJson.scripts ?? {})
  } catch {
    return []
  }
}

function collectSourceOfTruthFindings(projectRoot: string) {
  const findings: string[] = []
  const generatedFiles = ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']

  for (const fileName of generatedFiles) {
    const filePath = path.join(projectRoot, fileName)
    if (!existsSync(filePath)) {
      continue
    }
    const content = readFileSync(filePath, 'utf8')
    if (
      content.includes('Generated by APM CLI') &&
      !existsSync(path.join(projectRoot, '.apm'))
    ) {
      findings.push(
        `${fileName}: generated marker はあるが .apm source がありません。`,
      )
    } else if (
      content.includes('Generated by APM CLI') &&
      content.includes('manual drift')
    ) {
      findings.push(
        `${fileName}: generated artifact に手編集らしき内容があります。`,
      )
    }
  }

  findings.push(
    ...collectOrphanSkillFindings(projectRoot, '.agents/skills'),
    ...collectOrphanSkillFindings(projectRoot, '.cursor/skills'),
  )

  return findings
}

function collectOrphanSkillFindings(
  projectRoot: string,
  generatedRoot: string,
) {
  const root = path.join(projectRoot, generatedRoot)
  if (!existsSync(root)) {
    return []
  }

  return readdirSync(root)
    .filter((entry) => {
      const generatedSkill = path.join(root, entry)
      try {
        return statSync(generatedSkill).isDirectory()
      } catch {
        return false
      }
    })
    .filter(
      (entry) => !existsSync(path.join(projectRoot, '.apm/skills', entry)),
    )
    .map(
      (entry) =>
        `${generatedRoot}/${entry}/SKILL.md: .apm/skills/${entry}/SKILL.md がない orphan generated skill です。`,
    )
}

function collectChangedFiles(projectRoot: string) {
  try {
    const output = execFileSync(
      'git',
      ['status', '--short', '--untracked-files=all'],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )

    return output
      .split(/\r?\n/)
      .map((line) => line.slice(LINE_PREFIX_OFFSET).trim())
      .filter(Boolean)
      .map((line) => line.replace(/^"|"$/g, ''))
      .toSorted()
  } catch {
    return []
  }
}

export {
  buildSurfaceAuditCategories,
  collectChangedFiles,
  collectOrphanSkillFindings,
  collectSourceOfTruthFindings,
  findingsForCategory,
  readPackageScriptNames,
  summarizeScore,
  surfaceAuditCategoryNames,
  topActionLines,
}
