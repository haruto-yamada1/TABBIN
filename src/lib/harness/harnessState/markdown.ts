import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { toProjectRelativePath, writeJsonFile } from './io'
import { collectLearningCandidates, collectSecurityFindings } from './learning'
import {
  loadHarnessSnapshot,
  resolveHarnessRun,
  validateHarnessRun,
} from './run'
import { validationIssueLines } from './schemas'
import {
  buildSurfaceAuditCategories,
  collectChangedFiles,
  collectSourceOfTruthFindings,
  summarizeScore,
  topActionLines,
} from './scorecard'
import { harnessRoot, TOP_ACTIONS_DISPLAY_LIMIT } from './types'
import type {
  HarnessFileResult,
  HarnessRunOptions,
  HarnessSnapshot,
  HarnessStateFile,
  HarnessValidationResult,
} from './types'

function listLines(items: string[], emptyMessage: string) {
  if (items.length === 0) {
    return [`- ${emptyMessage}`]
  }

  return items.map((item) => `- ${item}`)
}

function oneLine(text: string | null) {
  if (!text) {
    return null
  }

  return text.replace(/\s+/g, ' ').trim()
}

function stateSummaryLines(snapshot: HarnessSnapshot) {
  return [
    stateSummaryLine('Orchestrator', snapshot.orchestrator),
    stateSummaryLine('Planner', snapshot.planner),
    stateSummaryLine('Generator', snapshot.generator),
    stateSummaryLine('Evaluator', snapshot.evaluator),
    stateSummaryLine('Decision', snapshot.decision),
    stateSummaryLine('Scorecard', snapshot.scorecard),
    stateSummaryLine('Learning', snapshot.learning),
  ]
}

function stateSummaryLine(label: string, state: HarnessStateFile | null) {
  if (!state) {
    return `- ${label}: 未記録`
  }

  return `- ${label}: \`${state.status ?? 'unknown'}\` - ${state.summary ?? 'summary なし'}`
}

// eslint-disable-next-line eslint/complexity
function verificationLines(snapshot: HarnessSnapshot) {
  const records = [
    ...(snapshot.orchestrator?.verification ?? []),
    ...(snapshot.planner?.verification ?? []),
    ...(snapshot.generator?.verification ?? []),
    ...(snapshot.evaluator?.verification ?? []),
    ...(snapshot.decision?.verification ?? []),
    ...(snapshot.scorecard?.verification ?? []),
    ...(snapshot.learning?.verification ?? []),
  ]

  if (records.length === 0) {
    return ['- 検証証跡なし。']
  }

  return records.map((record) => {
    const status = record.status ? ` (${record.status})` : ''
    const notes = record.notes ? `: ${record.notes}` : ''
    return `- \`${record.command ?? 'command 未記録'}\`${status}${notes}`
  })
}

function findingLines(snapshot: HarnessSnapshot) {
  const findings = snapshot.evaluator?.findings ?? []
  if (findings.length === 0) {
    return ['- 指摘なし。']
  }

  return findings.map((finding) => {
    const severity = finding.severity ? `[${finding.severity}] ` : ''
    const evidence = finding.evidence ? ` (${finding.evidence})` : ''
    return `- ${severity}${finding.summary ?? 'summary なし'}${evidence}`
  })
}

// eslint-disable-next-line eslint/complexity
function nextActionLines(snapshot: HarnessSnapshot) {
  const actions = [
    snapshot.orchestrator?.next_action &&
      `Orchestrator: ${snapshot.orchestrator.next_action}`,
    snapshot.planner?.next_action && `Planner: ${snapshot.planner.next_action}`,
    snapshot.generator?.next_action &&
      `Generator: ${snapshot.generator.next_action}`,
    snapshot.evaluator?.next_action &&
      `Evaluator: ${snapshot.evaluator.next_action}`,
    snapshot.decision?.next_action &&
      `Decision: ${snapshot.decision.next_action}`,
    snapshot.scorecard?.next_action &&
      `Scorecard: ${snapshot.scorecard.next_action}`,
    snapshot.learning?.next_action &&
      `Learning: ${snapshot.learning.next_action}`,
  ].filter((line): line is string => Boolean(line)) // eslint-disable-line unicorn/prefer-native-coercion-functions

  return listLines(actions, '次アクションなし。')
}

function schemaStatusForOptionalRun(
  validation: HarnessValidationResult,
): string {
  if (!validation.runId) {
    return 'not_applicable'
  }

  return validation.ok ? 'valid' : 'invalid'
}

export function buildHarnessStatusMarkdown(options: HarnessRunOptions): string {
  const snapshot = loadHarnessSnapshot(options)
  if (!snapshot) {
    return [
      '# ハーネス状態',
      '',
      '- ACTIVE run はありません。',
      '- 次の操作: 必要な場合だけ `.agents/harness/runs/<run-id>/` を作成してください。',
      '',
    ].join('\n')
  }

  const lines = [
    '# ハーネス状態',
    '',
    `- run: \`${snapshot.runId}\``,
    `- directory: \`${toProjectRelativePath(options.projectRoot, snapshot.runDirectory)}\``,
    `- task: ${oneLine(snapshot.task) ?? '未記録'}`,
    '',
    '## 状態',
    ...stateSummaryLines(snapshot),
    '',
    '## 検証証跡',
    ...verificationLines(snapshot),
    '',
    '## 指摘',
    ...findingLines(snapshot),
    '',
    '## 次アクション',
    ...nextActionLines(snapshot),
    '',
  ]

  return `${lines.join('\n')}\n`
}

export function buildHarnessAudit(
  options: HarnessRunOptions & {
    changedFiles?: string[]
  },
): string {
  const snapshot = loadHarnessSnapshot(options)
  const validation = validateHarnessRun(options)
  const changedFiles =
    options.changedFiles ?? collectChangedFiles(options.projectRoot)
  const learningCandidates = snapshot
    ? collectLearningCandidates(snapshot)
    : ['ACTIVE run がないため候補なし。']
  const surfaceCategories = buildSurfaceAuditCategories(options.projectRoot)
  const sourceFindings = collectSourceOfTruthFindings(options.projectRoot)

  const lines = [
    '# ハーネス監査',
    '',
    `- run: \`${validation.runId ?? 'なし'}\``,
    `- schema: ${validation.ok ? 'valid' : 'invalid'}`,
    '',
    '## schema / validator',
    ...validationIssueLines(validation),
    '',
    '## 変更ファイル',
    ...listLines(changedFiles, '変更ファイルなし。'),
    '',
    '## Generator / Evaluator',
    ...(snapshot ? stateSummaryLines(snapshot) : ['- ACTIVE run なし。']),
    '',
    '## 検証証跡',
    ...(snapshot ? verificationLines(snapshot) : ['- 検証証跡なし。']),
    '',
    '## deterministic scorecard',
    ...surfaceCategories.map(
      (category) =>
        `- ${category.name}: ${category.status} - ${category.evidence}`,
    ),
    '',
    '## source-of-truth sync',
    ...listLines(sourceFindings, 'drift / orphan は検出されませんでした。'),
    '',
    '## follow-up issue または `.apm/instructions` への追記候補',
    ...listLines(learningCandidates, '追記候補なし。'),
    '',
  ]

  return `${lines.join('\n')}\n`
}

export function buildHarnessRepoStatus(options: HarnessRunOptions): string {
  const snapshot = loadHarnessSnapshot(options)
  const validation = validateHarnessRun(options)
  const categories = buildSurfaceAuditCategories(options.projectRoot)
  const securityFindings = collectSecurityFindings(options.projectRoot)
  const score = summarizeScore(categories)
  const readiness =
    score.overallScore === score.maxScore && securityFindings.length === 0
      ? 'ready'
      : 'needs_attention'
  const schemaStatus = snapshot
    ? schemaStatusForOptionalRun(validation)
    : 'not_applicable'
  const lines = [
    '# ハーネス Repo Status',
    '',
    `- ACTIVE run: ${snapshot ? `\`${snapshot.runId}\`` : 'なし'}`,
    `- readiness: ${readiness}`,
    `- overall_score: ${score.overallScore}/${score.maxScore}`,
    `- schema: ${schemaStatus}`,
    `- security_findings: ${securityFindings.length}`,
    '',
    '## 次アクション',
    ...listLines(
      topActionLines(categories, securityFindings),
      '追加アクションなし。',
    ),
    '',
  ]

  return `${lines.join('\n')}\n`
}

export function buildHarnessSurfaceAudit(options: HarnessRunOptions): string {
  const categories = buildSurfaceAuditCategories(options.projectRoot)
  const sourceFindings = collectSourceOfTruthFindings(options.projectRoot)
  const securityFindings = collectSecurityFindings(options.projectRoot)
  const validation = validateHarnessRun(options)
  const resolved = resolveHarnessRun(options)
  const score = summarizeScore(categories)
  const topActions = topActionLines(categories, [
    ...sourceFindings,
    ...securityFindings,
  ])
  if (resolved && existsSync(resolved.runDirectory)) {
    writeJsonFile(path.join(resolved.runDirectory, 'scorecard.json'), {
      status:
        sourceFindings.length === 0 && securityFindings.length === 0
          ? 'done'
          : 'changes_requested',
      summary:
        sourceFindings.length === 0 && securityFindings.length === 0
          ? 'deterministic scorecard は通過した。'
          : 'surface audit に確認事項がある。',
      updated_at: new Date().toISOString(),
      next_action:
        topActions.length === 0
          ? 'Evaluator は scorecard を評価証跡として参照できる。'
          : topActions[0],
      overall_score: score.overallScore,
      top_actions: topActions,
      categories,
      verification: [
        {
          command: 'bun run harness:surface-audit',
          status: topActions.length === 0 ? 'passed' : 'review',
          notes:
            'deterministic scorecard、security guardrails、APM source-of-truth sync を確認した。',
        },
      ],
    })
  }
  const lines = [
    '# ハーネス Surface Audit',
    '',
    `- run: \`${validation.runId ?? 'なし'}\``,
    `- schema: ${schemaStatusForOptionalRun(validation)}`,
    '',
    `- overall_score: ${score.overallScore}/${score.maxScore}`,
    '',
    '## deterministic scorecard',
    ...categories.map(
      (category) =>
        `- ${category.name}: ${category.score}/${category.max_score} ${category.status} - ${category.evidence} (${category.notes})`,
    ),
    '',
    '## Top 3 actions',
    ...listLines(
      topActions.slice(0, TOP_ACTIONS_DISPLAY_LIMIT),
      '追加アクションなし。',
    ),
    '',
    '## APM source-of-truth sync',
    ...listLines(sourceFindings, 'drift / orphan は検出されませんでした。'),
    '',
  ]

  return `${lines.join('\n')}\n`
}

export function buildHarnessSecurityAudit(options: HarnessRunOptions): string {
  const findings = collectSecurityFindings(options.projectRoot)
  const grouped = findings.map(
    (finding) => `[${finding.severity}] ${finding.file}: ${finding.summary}`,
  )
  const lines = [
    '# ハーネス Security Audit',
    '',
    `- findings: ${findings.length}`,
    `- status: ${findings.length === 0 ? 'passed' : 'review'}`,
    '',
    '## findings',
    ...listLines(grouped, '危険な agent surface は検出されませんでした。'),
    '',
  ]

  return `${lines.join('\n')}\n`
}

export function buildHarnessProfile(_options: HarnessRunOptions): string {
  return [
    '# ハーネス profile',
    '',
    '- harness-planner: 要件分解、検証設計、担当分割を扱う。',
    '- harness-generator: 実装と checkpoint 証跡を扱う。',
    '- harness-evaluator: fresh-context 評価を扱う。hook から Evaluator は起動しません。',
    '- harness-optimizer: 評価結果と governance event から学習候補を抽出する。',
    '',
    '## commands',
    '- harness:start: run を作成する。',
    '- harness:plan: planner.json と orchestrator.json の plan を更新する。',
    '- harness:checkpoint: generator.json に検証証跡を追記する。',
    '- harness:evaluate: evaluator.json を fresh-context 起動待ちにする。',
    '- harness:surface-audit: deterministic scorecard と APM 同期を確認する。',
    '- harness:learn: learning.json に学習候補を抽出する。',
    '',
  ].join('\n')
}

export function writeHarnessStatusSnapshot(
  options: HarnessRunOptions,
): HarnessFileResult {
  const outputPath = path.join(options.projectRoot, harnessRoot, 'status.md')
  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, buildHarnessStatusMarkdown(options))
  return { path: outputPath }
}

export {
  findingLines,
  listLines,
  nextActionLines,
  oneLine,
  schemaStatusForOptionalRun,
  stateSummaryLine,
  stateSummaryLines,
  verificationLines,
}
