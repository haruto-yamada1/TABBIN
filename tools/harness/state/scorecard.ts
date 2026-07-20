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
    'Agent Context Health',
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
  const alwaysInjectedBytes = collectAlwaysInjectedInstructions(
    projectRoot,
  ).reduce(
    (total, entry) => total + Buffer.byteLength(entry.content, 'utf8'),
    0,
  )
  const agentsMdPath = path.join(projectRoot, 'AGENTS.md')
  const agentsMdTokens = existsSync(agentsMdPath)
    ? Math.ceil(readFileSync(agentsMdPath, 'utf8').length / 4)
    : 0
  const checks: Record<string, { evidence: string; ok: boolean }> = {
    'Tool Coverage': {
      ok:
        existsSync(path.join(projectRoot, '.apm/skills/harness-planner')) &&
        existsSync(path.join(projectRoot, '.apm/skills/harness-evaluator')),
      evidence: '.apm/skills/harness-*',
    },
    'Context Efficiency': {
      ok:
        existsSync(
          path.join(
            projectRoot,
            '.apm/instructions/00-context-mode.instructions.md',
          ),
        ) && alwaysInjectedBytes <= ALWAYS_INJECTED_BYTES_LIMIT,
      evidence: `context-mode routing + ${alwaysInjectedBytes} bytes always-injected (~${Math.ceil(alwaysInjectedBytes / 4)} tokens)`,
    },
    'Agent Context Health': {
      ok: checkAgentContextHealth(projectRoot),
      evidence:
        'AGENTS.md size, applyTo count, contamination, skill invocation',
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
        ) &&
        agentsMdTokens <= 20_000,
      evidence: `context-mode / RTK routing + AGENTS.md ~${agentsMdTokens} tokens`,
    },
    'GitHub Integration': {
      ok:
        existsSync(path.join(projectRoot, '.github/workflows')) ||
        existsSync(path.join(projectRoot, '.github/instructions')),
      evidence: '.github/workflows または .github/instructions',
    },
  }

  const contextFindings = collectAgentContextFindings(projectRoot)

  return surfaceAuditCategoryNames().map((name) => {
    const check = checks[name]
    const findings = findingsForCategory(
      name,
      sourceFindings,
      securityFindings,
      contextFindings,
      alwaysInjectedBytes,
    )
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
        `[${String(category.name)}] ${String(category.evidence)} を確認し、source-of-truth から不足を補う。`,
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
  contextFindings: string[] = [],
  alwaysInjectedBytes = 0,
) {
  if (name === 'Source-of-truth Sync') {
    return sourceFindings
  }
  if (name === 'Security Guardrails') {
    return securityFindings.map(
      (finding) => `${finding.file}: ${finding.summary}`,
    )
  }
  if (name === 'Agent Context Health') {
    return contextFindings
  }
  if (name === 'Context Efficiency') {
    return alwaysInjectedBytes > ALWAYS_INJECTED_BYTES_LIMIT
      ? [
          `applyTo: "**/*" instruction の合計が ${alwaysInjectedBytes} bytes で ${ALWAYS_INJECTED_BYTES_LIMIT} bytes を超過しています。`,
        ]
      : []
  }
  return []
}

function checkAgentContextHealth(projectRoot: string): boolean {
  const contextFindings = collectAgentContextFindings(projectRoot)
  return contextFindings.length === 0
}

const AGENTS_MD_HARD_LIMIT_BYTES = 40_000
const AGENTS_MD_SIZE_BASELINE_BYTES = 30_000
const AGENTS_MD_GROWTH_THRESHOLD = 0.15
const ALWAYS_INJECTED_COUNT_LIMIT = 5
const ALWAYS_INJECTED_BYTES_LIMIT = 30_000

const SIDE_EFFECT_SKILL_PATTERN =
  /^(commit-push-pr|github-issue-implementation|github-pr-review|babysit|finishing-a-development-branch|statusline|harness-(planner|generator|evaluator|optimizer)|create-(hook|rule|skill|subagent)|caveman(-commit|-compress|-review|-stats)?)$/

type ParsedSkillFrontmatter = {
  disableModelInvocation: boolean
  frontmatterValid: boolean
  name?: string
}

const parseSkillFrontmatter = (content: string): ParsedSkillFrontmatter => {
  const match = /^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/.exec(content)
  if (!match) {
    return { disableModelInvocation: false, frontmatterValid: false }
  }
  const block = match[1]
  const fields = new Map<string, string>()
  for (const line of block.split('\n')) {
    const kv = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line)
    if (kv) {
      fields.set(kv[1], kv[2].trim())
    }
  }
  return {
    disableModelInvocation: fields.get('disable-model-invocation') === 'true',
    frontmatterValid: true,
    name: fields.get('name'),
  }
}

const collectAlwaysInjectedInstructions = (
  projectRoot: string,
): { content: string; file: string }[] => {
  const instructionsDir = path.join(projectRoot, '.apm/instructions')
  if (!existsSync(instructionsDir)) {
    return []
  }
  return readdirSync(instructionsDir)
    .filter((file) => file.endsWith('.instructions.md'))
    .map((file) => ({
      content: readFileSync(path.join(instructionsDir, file), 'utf8'),
      file,
    }))
    .filter((entry) => entry.content.includes('applyTo: "**/*"'))
}

const collectSkillScriptReferenceFindings = (projectRoot: string): string[] => {
  const skillsDir = path.join(projectRoot, '.apm/skills')
  if (!existsSync(skillsDir)) {
    return []
  }
  const scripts = new Set(readPackageScriptNames(projectRoot))
  const findings: string[] = []
  const checkFile = (absolute: string): void => {
    const content = readFileSync(absolute, 'utf8')
    for (const match of content.matchAll(/bun run ([a-z0-9][a-z0-9:._-]*)/g)) {
      const script = match[1]
      if (!scripts.has(script)) {
        findings.push(
          `${path.relative(projectRoot, absolute)}: 参照する package script \`bun run ${script}\` が package.json にありません。`,
        )
      }
    }
  }
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const absolute = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(absolute)
      } else if (/\.(md|yaml|yml|sh|toml|json|ts|js)$/.test(entry.name)) {
        checkFile(absolute)
      }
    }
  }
  walk(skillsDir)
  return findings
}

const collectGeneratedArtifactFindings = (projectRoot: string): string[] => {
  const findings: string[] = []
  for (const fileName of ['AGENTS.md', 'CLAUDE.md', 'GEMINI.md']) {
    const filePath = path.join(projectRoot, fileName)
    if (!existsSync(filePath)) {
      continue
    }
    const content = readFileSync(filePath, 'utf8')
    if (/\/Users\/[A-Za-z0-9_-]+\//.test(content)) {
      findings.push(`${fileName}: 個人絶対パスが混入しています。`)
    }
    if (/\/home\/[A-Za-z0-9_-]+\//.test(content)) {
      findings.push(`${fileName}: 個人絶対パスが混入しています。`)
    }
    if (content.includes('Preview: Would generate')) {
      findings.push(`${fileName}: preview/dry-run 出力が混入しています。`)
    }
    if (content.includes('Would generate stub')) {
      findings.push(`${fileName}: preview/dry-run 出力が混入しています。`)
    }
  }
  return findings
}

const collectSideEffectSkillFindings = (projectRoot: string): string[] => {
  const skillsDir = path.join(projectRoot, '.apm/skills')
  if (!existsSync(skillsDir)) {
    return []
  }
  const findings: string[] = []
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !SIDE_EFFECT_SKILL_PATTERN.test(entry.name)) {
      continue
    }
    const skillPath = path.join(skillsDir, entry.name, 'SKILL.md')
    if (!existsSync(skillPath)) {
      continue
    }
    const frontmatter = parseSkillFrontmatter(readFileSync(skillPath, 'utf8'))
    if (!frontmatter.frontmatterValid) {
      findings.push(
        `.apm/skills/${entry.name}/SKILL.md: 副作用 Skill に frontmatter がありません。`,
      )
      continue
    }
    if (!frontmatter.disableModelInvocation) {
      findings.push(
        `.apm/skills/${entry.name}/SKILL.md: 副作用 Skill に disable-model-invocation: true がありません。`,
      )
    }
    if (frontmatter.name && frontmatter.name !== entry.name) {
      findings.push(
        `.apm/skills/${entry.name}/SKILL.md: frontmatter name "${frontmatter.name}" がディレクトリ名と不一致です。`,
      )
    }
  }
  return findings
}

function collectAgentContextFindings(projectRoot: string): string[] {
  const findings: string[] = []

  // AGENTS.md size — hard limit plus baseline-growth ratio.
  const agentsMdPath = path.join(projectRoot, 'AGENTS.md')
  if (existsSync(agentsMdPath)) {
    const content = readFileSync(agentsMdPath, 'utf8')
    const size = Buffer.byteLength(content, 'utf8')
    const lines = content.split('\n').length
    const approxTokens = Math.ceil(size / 4)
    if (size > AGENTS_MD_HARD_LIMIT_BYTES) {
      findings.push(
        `AGENTS.md が ${size} bytes / ${lines} 行 / ~${approxTokens} tokens で大きすぎます (${AGENTS_MD_HARD_LIMIT_BYTES} bytes 超過)。instruction を縮小してください。`,
      )
    } else if (
      size >
      AGENTS_MD_SIZE_BASELINE_BYTES * (1 + AGENTS_MD_GROWTH_THRESHOLD)
    ) {
      findings.push(
        `AGENTS.md が ${size} bytes で baseline (${AGENTS_MD_SIZE_BASELINE_BYTES} bytes) 比 ${Math.round(AGENTS_MD_GROWTH_THRESHOLD * 100)}% 超過です (~${approxTokens} tokens)。instruction を縮小してください。`,
      )
    }
  }

  // applyTo: "**/*" always-injected instructions — count and total bytes.
  const alwaysInjected = collectAlwaysInjectedInstructions(projectRoot)
  if (alwaysInjected.length > ALWAYS_INJECTED_COUNT_LIMIT) {
    findings.push(
      `applyTo: "**/*" instruction が ${alwaysInjected.length} 個あります (${ALWAYS_INJECTED_COUNT_LIMIT} 超過)。用途限定の instruction を Skill へ移動してください。`,
    )
  }
  const alwaysInjectedBytes = alwaysInjected.reduce(
    (total, entry) => total + Buffer.byteLength(entry.content, 'utf8'),
    0,
  )
  if (alwaysInjectedBytes > ALWAYS_INJECTED_BYTES_LIMIT) {
    findings.push(
      `applyTo: "**/*" instruction の合計が ${alwaysInjectedBytes} bytes (~${Math.ceil(alwaysInjectedBytes / 4)} tokens) で ${ALWAYS_INJECTED_BYTES_LIMIT} bytes を超過しています。用途限定の instruction を Skill へ移動してください。`,
    )
  }

  findings.push(
    ...collectGeneratedArtifactFindings(projectRoot),
    ...collectSideEffectSkillFindings(projectRoot),
    ...collectSkillScriptReferenceFindings(projectRoot),
  )

  return findings
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
  collectAgentContextFindings,
  collectChangedFiles,
  collectOrphanSkillFindings,
  collectSourceOfTruthFindings,
  findingsForCategory,
  readPackageScriptNames,
  summarizeScore,
  surfaceAuditCategoryNames,
  topActionLines,
}
