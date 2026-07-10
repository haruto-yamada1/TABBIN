import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { toProjectRelativePath } from './io'
import type {
  FindingRecord,
  HarnessSnapshot,
  LearningRecord,
  SecurityFinding,
} from './types'

function collectLearningCandidates(snapshot: HarnessSnapshot) {
  if (
    snapshot.evaluator?.status !== 'changes_requested' &&
    snapshot.evaluator?.status !== 'blocked'
  ) {
    return []
  }

  return (snapshot.evaluator.findings ?? []).map((finding) => {
    const summary = finding.summary ?? 'summary なし'
    return `${summary} - 再発する場合は follow-up issue または \`.apm/instructions\` への追記を検討する。`
  })
}

function readGovernanceLearningCandidates(
  runDirectory: string,
): LearningRecord[] {
  const governancePath = path.join(runDirectory, 'governance.jsonl')
  if (!existsSync(governancePath)) {
    return []
  }

  const records: LearningRecord[] = []
  for (const line of readFileSync(governancePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      continue
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      continue
    }
    if (typeof parsed !== 'object' || parsed === null) {
      continue
    }
    const message = 'message' in parsed ? String(parsed.message) : ''
    if (message.length === 0) {
      continue
    }
    const kind =
      'kind' in parsed && typeof parsed.kind === 'string'
        ? parsed.kind
        : undefined
    records.push({
      source: `governance:${kind ?? 'manual'}`,
      summary: message,
      status: 'candidate',
      target: learningTargetForSummary(message),
    })
  }
  return records
}

function learningTargetForFinding(finding: FindingRecord) {
  return learningTargetForSummary(
    `${finding.summary ?? ''} ${finding.evidence ?? ''}`,
  )
}

function learningTargetForSummary(summary: string) {
  if (/hook|PreToolUse|Stop|SessionStart|PreCompact/i.test(summary)) {
    return '.apm/hooks または .apm/instructions/harness.instructions.md'
  }
  if (/skill|prompt|Evaluator|Generator|Planner/i.test(summary)) {
    return '.apm/skills または .apm/prompts'
  }
  if (/issue|follow-up/i.test(summary)) {
    return 'follow-up issue'
  }
  return 'follow-up issue または .apm/instructions'
}

function collectSecurityFindings(projectRoot: string): SecurityFinding[] {
  const findings: SecurityFinding[] = []
  const files = [
    ...listFiles(path.join(projectRoot, '.apm/hooks/scripts')),
    ...listFiles(path.join(projectRoot, '.apm/skills')),
    ...listFiles(path.join(projectRoot, '.apm/prompts')),
  ].filter((file) => /\.(sh|md|json|yaml|yml|ts|js)$/.test(file))

  for (const file of files) {
    const relativePath = toProjectRelativePath(projectRoot, file)
    const content = safeRead(file)
    if (!content) {
      continue
    }
    const scannedContent = securityRelevantContent(file, content)
    const isExecutableSurface = /\.(sh|ts|js|json|yaml|yml)$/.test(file)
    const checks: [RegExp, string, string, boolean][] = [
      [
        /\bcurl\b|\bwget\b/,
        'high',
        'curl / wget による直接取得があります。',
        isExecutableSurface,
      ],
      [
        /\bnode\s+-e\b|\bpython\d?\s+-c\b/,
        'medium',
        'inline eval 形式の実行があります。',
        isExecutableSurface,
      ],
      [
        /そのまま実行|ignore previous/i,
        'medium',
        '外部または本文の指示を無条件に扱う prompt injection リスクがあります。',
        true,
      ],
      [
        /(api[_-]?key|secret|token|password)\s*[:=]\s*['"][^'"]+['"]/i,
        'high',
        'secret らしき値が agent surface に含まれています。',
        isExecutableSurface,
      ],
    ]
    for (const [pattern, severity, summary, enabled] of checks) {
      if (enabled && pattern.test(scannedContent)) {
        findings.push({ file: relativePath, severity, summary })
      }
    }
  }

  return findings
}

function securityRelevantContent(filePath: string, content: string) {
  if (!filePath.endsWith('.sh')) {
    return content
  }

  return content.replace(
    /\n[^\n]*<<['"]?([A-Z][A-Z0-9_]*)['"]?\n[\s\S]*?\n\1\n/g,
    '\n',
  )
}

function listFiles(root: string): string[] {
  if (!existsSync(root)) {
    return []
  }
  const files: string[] = []
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        visit(entryPath)
      } else {
        files.push(entryPath)
      }
    }
  }
  visit(root)
  return files
}

function safeRead(filePath: string) {
  try {
    return readFileSync(filePath, 'utf8')
  } catch {
    return ''
  }
}

export {
  collectLearningCandidates,
  collectSecurityFindings,
  learningTargetForFinding,
  learningTargetForSummary,
  listFiles,
  readGovernanceLearningCandidates,
  safeRead,
  securityRelevantContent,
}
