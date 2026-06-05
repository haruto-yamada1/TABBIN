import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

const harnessRoot = '.agents/harness'
const runRoot = `${harnessRoot}/runs`
const schemaRoot = '.apm/harness/schemas'

const stateStatuses = [
  'pending',
  'running',
  'done',
  'approved',
  'changes_requested',
  'blocked',
] as const

type HarnessStateStatus = (typeof stateStatuses)[number]
type JsonPrimitive = string | number | boolean | null
type JsonValue = JsonPrimitive | JsonObject | JsonValue[]
interface JsonObject {
  [key: string]: JsonValue
}

interface JsonSchema {
  additionalProperties?: boolean
  enum?: JsonValue[]
  items?: JsonSchema
  properties?: Record<string, JsonSchema>
  required?: string[]
  type?: 'array' | 'boolean' | 'number' | 'object' | 'string'
}

type HarnessFileName =
  | 'orchestrator.json'
  | 'planner.json'
  | 'generator.json'
  | 'evaluator.json'
  | 'decision.json'
  | 'scorecard.json'
  | 'learning.json'

export interface HarnessValidationIssue {
  file: HarnessFileName | 'ACTIVE' | 'run'
  message: string
  path: string
}

export interface HarnessValidationResult {
  issues: HarnessValidationIssue[]
  ok: boolean
  runDirectory: string | null
  runId: string | null
}

interface VerificationRecord {
  command?: string
  notes?: string
  status?: string
}

interface FindingRecord {
  evidence?: string
  severity?: string
  summary?: string
}

interface ChecklistRecord {
  evidence?: string
  requirement?: string
  status?: string
}

interface ScorecardRecord {
  evidence?: string
  findings?: string[]
  max_score?: number
  name?: string
  notes?: string
  score?: number
  status?: string
}

interface LearningRecord {
  target?: string
  source?: string
  status?: string
  summary?: string
}

interface SecurityFinding {
  file: string
  severity: string
  summary: string
}

interface HarnessStateFile {
  agents?: AgentRecord[]
  candidates?: LearningRecord[]
  categories?: ScorecardRecord[]
  checklist?: ChecklistRecord[]
  findings?: FindingRecord[]
  next_action?: string
  overall_score?: number
  plan?: PlanRecord[]
  role?: string
  top_actions?: string[]
  status?: HarnessStateStatus
  summary?: string
  updated_at?: string
  verification?: VerificationRecord[]
}

interface AgentRecord {
  name?: string
  responsibility?: string
  role?: string
  status?: string
}

interface PlanRecord {
  files?: string[]
  id?: string
  owner?: string
  status?: string
  title?: string
}

interface HarnessSnapshot {
  decision: HarnessStateFile | null
  evaluator: HarnessStateFile | null
  generator: HarnessStateFile | null
  learning: HarnessStateFile | null
  orchestrator: HarnessStateFile | null
  planner: HarnessStateFile | null
  runDirectory: string
  runId: string
  scorecard: HarnessStateFile | null
  task: string | null
}

export interface HarnessRunOptions {
  projectRoot: string
  runId?: string
}

export interface InitializeHarnessRunOptions {
  projectRoot: string
  runId?: string
  task: string
}

export interface InitializeHarnessRunResult {
  runDirectory: string
  runId: string
}

export interface HarnessGovernanceEvent {
  kind: string
  message: string
  severity: string
  source: string
}

export interface HarnessFileResult {
  path: string
}

export interface HarnessPlanOptions extends HarnessRunOptions {
  nextAction?: string
  summary?: string
  tasks?: string[]
}

export interface HarnessCheckpointOptions extends HarnessRunOptions {
  command: string
  nextAction?: string
  notes: string
  status: string
  summary?: string
}

export interface HarnessEvaluateOptions extends HarnessRunOptions {
  nextAction?: string
  summary?: string
}

const verificationSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['command', 'status', 'notes'],
  properties: {
    command: { type: 'string' },
    status: { type: 'string' },
    notes: { type: 'string' },
  },
}

const findingSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['severity', 'summary', 'evidence'],
  properties: {
    severity: { type: 'string' },
    summary: { type: 'string' },
    evidence: { type: 'string' },
  },
}

const checklistSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['requirement', 'evidence', 'status'],
  properties: {
    requirement: { type: 'string' },
    evidence: { type: 'string' },
    status: { type: 'string' },
  },
}

const planSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'title', 'owner', 'files', 'status'],
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    owner: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    status: { type: 'string' },
  },
}

const agentSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'role', 'responsibility', 'status'],
  properties: {
    name: { type: 'string' },
    role: { type: 'string' },
    responsibility: { type: 'string' },
    status: { type: 'string' },
  },
}

const scorecardSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'status', 'evidence', 'notes'],
  properties: {
    name: { type: 'string' },
    status: { type: 'string' },
    evidence: { type: 'string' },
    notes: { type: 'string' },
    score: { type: 'number' },
    max_score: { type: 'number' },
    findings: { type: 'array', items: { type: 'string' } },
  },
}

const learningSchema: JsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['source', 'summary', 'status'],
  properties: {
    source: { type: 'string' },
    summary: { type: 'string' },
    status: { type: 'string' },
    target: { type: 'string' },
  },
}

const baseStateProperties: Record<string, JsonSchema> = {
  status: { type: 'string', enum: [...stateStatuses] },
  summary: { type: 'string' },
  updated_at: { type: 'string' },
  next_action: { type: 'string' },
  overall_score: { type: 'number' },
  top_actions: { type: 'array', items: { type: 'string' } },
  verification: { type: 'array', items: verificationSchema },
}

export const harnessSchemas: Record<HarnessFileName, JsonSchema> = {
  'orchestrator.json': {
    type: 'object',
    additionalProperties: false,
    required: [
      'status',
      'summary',
      'updated_at',
      'next_action',
      'plan',
      'agents',
      'verification',
    ],
    properties: {
      ...baseStateProperties,
      plan: { type: 'array', items: planSchema },
      agents: { type: 'array', items: agentSchema },
    },
  },
  'planner.json': {
    type: 'object',
    additionalProperties: false,
    required: [
      'status',
      'summary',
      'updated_at',
      'next_action',
      'role',
      'plan',
      'verification',
    ],
    properties: {
      ...baseStateProperties,
      role: { type: 'string' },
      plan: { type: 'array', items: planSchema },
    },
  },
  'generator.json': {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'summary', 'updated_at', 'next_action'],
    properties: baseStateProperties,
  },
  'evaluator.json': {
    type: 'object',
    additionalProperties: false,
    required: [
      'status',
      'summary',
      'updated_at',
      'next_action',
      'findings',
      'checklist',
      'verification',
    ],
    properties: {
      ...baseStateProperties,
      findings: { type: 'array', items: findingSchema },
      checklist: { type: 'array', items: checklistSchema },
    },
  },
  'decision.json': {
    type: 'object',
    additionalProperties: false,
    required: ['status', 'summary', 'updated_at', 'next_action'],
    properties: baseStateProperties,
  },
  'scorecard.json': {
    type: 'object',
    additionalProperties: false,
    required: [
      'status',
      'summary',
      'updated_at',
      'next_action',
      'categories',
      'verification',
    ],
    properties: {
      ...baseStateProperties,
      categories: { type: 'array', items: scorecardSchema },
    },
  },
  'learning.json': {
    type: 'object',
    additionalProperties: false,
    required: [
      'status',
      'summary',
      'updated_at',
      'next_action',
      'candidates',
      'verification',
    ],
    properties: {
      ...baseStateProperties,
      candidates: { type: 'array', items: learningSchema },
    },
  },
}

export function writeHarnessSchemaFiles(projectRoot: string) {
  const outputRoot = path.join(projectRoot, schemaRoot)
  mkdirSync(outputRoot, { recursive: true })

  for (const [fileName, schema] of Object.entries(harnessSchemas)) {
    const schemaPath = path.join(
      outputRoot,
      fileName.replace('.json', '.schema.json'),
    )
    writeFileSync(
      schemaPath,
      `${JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', ...schema }, null, 2)}\n`,
    )
  }
}

export function initializeHarnessRun(
  options: InitializeHarnessRunOptions,
): InitializeHarnessRunResult {
  const runId = options.runId ?? defaultRunId()
  const harnessDirectory = path.join(options.projectRoot, harnessRoot)
  const runDirectory = path.join(options.projectRoot, runRoot, runId)
  const updatedAt = new Date().toISOString()

  mkdirSync(runDirectory, { recursive: true })
  writeFileSync(path.join(harnessDirectory, 'ACTIVE'), `${runId}\n`)
  writeFileSync(path.join(runDirectory, 'task.md'), `${options.task.trim()}\n`)
  writeJsonFile(path.join(runDirectory, 'orchestrator.json'), {
    status: 'running',
    summary:
      '依頼を受け付け、Orchestrator が分解、割り当て、評価計画を開始した。',
    updated_at: updatedAt,
    next_action:
      'Planner に作業分解を渡し、必要な Generator / Evaluator を割り当てる。',
    plan: [],
    agents: [
      {
        name: 'harness-planner',
        role: 'Planner',
        responsibility: '要件、制約、検証方針を作業単位へ分解する。',
        status: 'pending',
      },
      {
        name: 'harness-generator',
        role: 'Generator',
        responsibility: '計画に沿って実装し、検証証跡を残す。',
        status: 'pending',
      },
      {
        name: 'harness-evaluator',
        role: 'Evaluator',
        responsibility:
          'fresh-context で成果物、証跡、source-of-truth を評価する。',
        status: 'pending',
      },
    ],
    verification: [],
  })
  writeJsonFile(path.join(runDirectory, 'planner.json'), {
    status: 'pending',
    summary: 'Planner は作業分解待ち。',
    updated_at: updatedAt,
    next_action: '要件、制約、検証方針を plan に記録する。',
    role: 'Planner',
    plan: [],
    verification: [],
  })
  writeJsonFile(path.join(runDirectory, 'generator.json'), {
    status: 'pending',
    summary: 'Orchestrator の割り当て待ち。',
    updated_at: updatedAt,
    next_action: 'Orchestrator の計画に従って実装する。',
    verification: [],
  })
  writeJsonFile(path.join(runDirectory, 'scorecard.json'), {
    status: 'pending',
    summary: 'deterministic scorecard は未実行。',
    updated_at: updatedAt,
    next_action: '`bun run harness:surface-audit` で repo surface を監査する。',
    categories: surfaceAuditCategoryNames().map((name) => ({
      name,
      status: 'pending',
      evidence: '未実行',
      notes: 'surface-audit で更新する。',
    })),
    verification: [],
  })
  writeJsonFile(path.join(runDirectory, 'learning.json'), {
    status: 'pending',
    summary: '学習候補は未抽出。',
    updated_at: updatedAt,
    next_action:
      '`bun run harness:learn` で Evaluator / governance から候補を抽出する。',
    candidates: [],
    verification: [],
  })

  return { runDirectory, runId }
}

export function validateHarnessRun(
  options: HarnessRunOptions,
): HarnessValidationResult {
  const resolved = resolveHarnessRun(options)
  if (!resolved) {
    return {
      issues: [
        {
          file: 'ACTIVE',
          path: '/',
          message: '.agents/harness/ACTIVE または run id が見つかりません。',
        },
      ],
      ok: false,
      runDirectory: null,
      runId: null,
    }
  }

  if (!existsSync(resolved.runDirectory)) {
    return {
      issues: [
        {
          file: 'run',
          path: '/',
          message: `run directory が存在しません: ${resolved.runDirectory}`,
        },
      ],
      ok: false,
      runDirectory: resolved.runDirectory,
      runId: resolved.runId,
    }
  }

  const issues: HarnessValidationIssue[] = []
  let foundStateFile = false

  for (const fileName of harnessFileNames()) {
    const filePath = path.join(resolved.runDirectory, fileName)
    if (!existsSync(filePath)) {
      continue
    }

    foundStateFile = true
    const parsed = readJsonFile(filePath)
    if (!parsed.ok) {
      issues.push({
        file: fileName,
        path: '/',
        message: parsed.message,
      })
      continue
    }

    issues.push(
      ...validateJsonSchema(parsed.value, harnessSchemas[fileName]).map(
        (issue) => ({
          file: fileName,
          path: issue.path,
          message: issue.message,
        }),
      ),
    )
  }

  if (!foundStateFile) {
    issues.push({
      file: 'run',
      path: '/',
      message:
        'orchestrator.json / generator.json / evaluator.json / decision.json のいずれも存在しません。',
    })
  }

  return {
    issues,
    ok: issues.length === 0,
    runDirectory: resolved.runDirectory,
    runId: resolved.runId,
  }
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

function schemaStatusForOptionalRun(
  validation: HarnessValidationResult,
): string {
  if (!validation.runId) {
    return 'not_applicable'
  }

  return validation.ok ? 'valid' : 'invalid'
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

export function planHarnessRun(options: HarnessPlanOptions): HarnessFileResult {
  const resolved = requireHarnessRun(options)
  const updatedAt = new Date().toISOString()
  const tasks = options.tasks ?? []
  const plan = tasks.map((title, index) => ({
    id: `plan-${String(index + 1).padStart(2, '0')}`,
    title,
    owner: index === 0 ? 'harness-generator' : 'harness-orchestrator',
    files: [],
    status: 'pending',
  }))
  const plannerPath = path.join(resolved.runDirectory, 'planner.json')

  writeJsonFile(plannerPath, {
    status: 'done',
    summary: options.summary ?? 'Planner が作業分解を記録した。',
    updated_at: updatedAt,
    next_action:
      options.nextAction ??
      'Generator は planner.json の plan と検証方針に沿って実装する。',
    role: 'Planner',
    plan,
    verification: [],
  })

  const orchestrator = readStateIfExists(
    path.join(resolved.runDirectory, 'orchestrator.json'),
  )
  if (orchestrator) {
    writeJsonFile(path.join(resolved.runDirectory, 'orchestrator.json'), {
      ...orchestrator,
      status: 'running',
      summary:
        options.summary ?? orchestrator.summary ?? 'Planner を更新した。',
      updated_at: updatedAt,
      next_action:
        options.nextAction ??
        'Generator は planner.json の plan と検証方針に沿って実装する。',
      plan,
      agents: orchestrator.agents ?? [],
      verification: orchestrator.verification ?? [],
    })
  }

  return { path: plannerPath }
}

export function checkpointHarnessRun(
  options: HarnessCheckpointOptions,
): HarnessFileResult {
  const resolved = requireHarnessRun(options)
  const generatorPath = path.join(resolved.runDirectory, 'generator.json')
  const current = readStateIfExists(generatorPath)
  const verification = [
    ...(current?.verification ?? []),
    {
      command: options.command,
      status: options.status,
      notes: options.notes,
    },
  ]

  writeJsonFile(generatorPath, {
    status: options.status === 'passed' ? 'done' : 'running',
    summary:
      options.summary ??
      current?.summary ??
      'Generator が checkpoint と検証証跡を記録した。',
    updated_at: new Date().toISOString(),
    next_action:
      options.nextAction ??
      current?.next_action ??
      '次の実装または検証ステップへ進む。',
    verification,
  })

  return { path: generatorPath }
}

export function evaluateHarnessRun(
  options: HarnessEvaluateOptions,
): HarnessFileResult {
  const resolved = requireHarnessRun(options)
  const evaluatorPath = path.join(resolved.runDirectory, 'evaluator.json')

  writeJsonFile(evaluatorPath, {
    status: 'pending',
    summary:
      options.summary ??
      'Evaluator を fresh-context で起動するための状態を準備した。',
    updated_at: new Date().toISOString(),
    next_action:
      options.nextAction ??
      '.apm/prompts/harness-evaluator.prompt.md を使い、fresh-context Evaluator を手動起動する。',
    findings: [],
    checklist: [
      {
        requirement: 'Evaluator は hook から自動起動しない',
        evidence: '.apm/prompts/harness-evaluator.prompt.md',
        status: 'pending',
      },
    ],
    verification: [],
  })

  return { path: evaluatorPath }
}

export function learnFromHarnessRun(
  options: HarnessRunOptions,
): HarnessFileResult {
  const resolved = requireHarnessRun(options)
  const snapshot = loadHarnessSnapshot(options)
  const candidates: LearningRecord[] = [
    ...(snapshot?.evaluator?.findings ?? []).map((finding) => ({
      source: 'evaluator.json',
      summary: finding.summary ?? 'Evaluator finding summary なし',
      status: 'candidate',
      target: learningTargetForFinding(finding),
    })),
    ...readGovernanceLearningCandidates(resolved.runDirectory),
  ]
  const learningPath = path.join(resolved.runDirectory, 'learning.json')

  writeJsonFile(learningPath, {
    status: 'done',
    summary:
      candidates.length > 0 ? '学習候補を抽出した。' : '学習候補はありません。',
    updated_at: new Date().toISOString(),
    next_action:
      '必要な候補だけ follow-up issue または `.apm/instructions` に手動反映する。',
    candidates:
      candidates.length > 0
        ? candidates
        : [
            {
              source: 'learn',
              summary: '学習候補なし',
              status: 'recorded',
              target: 'follow-up issue または .apm/instructions',
            },
          ],
    verification: [],
  })

  return { path: learningPath }
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
    ...listLines(topActions.slice(0, 3), '追加アクションなし。'),
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

export function recordHarnessGovernanceEvent(options: {
  event: HarnessGovernanceEvent
  projectRoot: string
  runId?: string
}): HarnessFileResult {
  const resolved = resolveHarnessRun({
    projectRoot: options.projectRoot,
    runId: options.runId,
  })
  const eventDirectory =
    resolved?.runDirectory ?? path.join(options.projectRoot, harnessRoot)
  const outputPath = path.join(eventDirectory, 'governance.jsonl')
  const payload = {
    ...options.event,
    updated_at: new Date().toISOString(),
  }

  mkdirSync(eventDirectory, { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(payload)}\n`, {
    flag: 'a',
  })

  return { path: outputPath }
}

function harnessFileNames(): HarnessFileName[] {
  return [
    'orchestrator.json',
    'planner.json',
    'generator.json',
    'evaluator.json',
    'decision.json',
    'scorecard.json',
    'learning.json',
  ]
}

function requireHarnessRun(options: HarnessRunOptions) {
  const resolved = resolveHarnessRun(options)
  if (!resolved || !existsSync(resolved.runDirectory)) {
    throw new Error(
      '.agents/harness/ACTIVE または run directory が見つかりません。',
    )
  }

  return resolved
}

function resolveHarnessRun(options: HarnessRunOptions) {
  const runIdOrPath = options.runId ?? readActiveRun(options.projectRoot)
  if (!runIdOrPath) {
    return null
  }

  const runDirectory = path.isAbsolute(runIdOrPath)
    ? path.normalize(runIdOrPath)
    : path.join(options.projectRoot, runRoot, runIdOrPath)
  const runId = path.basename(runDirectory)

  return { runDirectory, runId }
}

function readActiveRun(projectRoot: string) {
  const activePath = path.join(projectRoot, harnessRoot, 'ACTIVE')
  if (!existsSync(activePath)) {
    return null
  }

  const content = readFileSync(activePath, 'utf8').trim()
  return content.length > 0 ? content : null
}

function loadHarnessSnapshot(
  options: HarnessRunOptions,
): HarnessSnapshot | null {
  const resolved = resolveHarnessRun(options)
  if (!resolved || !existsSync(resolved.runDirectory)) {
    return null
  }

  return {
    runId: resolved.runId,
    runDirectory: resolved.runDirectory,
    task: readTextIfExists(path.join(resolved.runDirectory, 'task.md')),
    orchestrator: readStateIfExists(
      path.join(resolved.runDirectory, 'orchestrator.json'),
    ),
    planner: readStateIfExists(
      path.join(resolved.runDirectory, 'planner.json'),
    ),
    generator: readStateIfExists(
      path.join(resolved.runDirectory, 'generator.json'),
    ),
    evaluator: readStateIfExists(
      path.join(resolved.runDirectory, 'evaluator.json'),
    ),
    decision: readStateIfExists(
      path.join(resolved.runDirectory, 'decision.json'),
    ),
    scorecard: readStateIfExists(
      path.join(resolved.runDirectory, 'scorecard.json'),
    ),
    learning: readStateIfExists(
      path.join(resolved.runDirectory, 'learning.json'),
    ),
  }
}

function writeJsonFile(filePath: string, value: unknown) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
}

function readTextIfExists(filePath: string) {
  if (!existsSync(filePath)) {
    return null
  }

  return readFileSync(filePath, 'utf8')
}

function readStateIfExists(filePath: string): HarnessStateFile | null {
  if (!existsSync(filePath)) {
    return null
  }

  const parsed = readJsonFile(filePath)
  if (!parsed.ok || !isObject(parsed.value)) {
    return null
  }

  return parsed.value as HarnessStateFile
}

function readJsonFile(
  filePath: string,
): { ok: true; value: JsonValue } | { message: string; ok: false } {
  try {
    return { ok: true, value: JSON.parse(readFileSync(filePath, 'utf8')) }
  } catch (error) {
    return {
      ok: false,
      message: getErrorMessage(error),
    }
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function validateJsonSchema(value: JsonValue, schema: JsonSchema, at = '/') {
  const issues: { message: string; path: string }[] = []

  if (schema.type && !matchesType(value, schema.type)) {
    issues.push({
      path: at,
      message: `型が不正です。期待値: ${schema.type}`,
    })
    return issues
  }

  if (schema.enum && !schema.enum.some((item) => deepEqual(item, value))) {
    issues.push({
      path: at,
      message: `許可されていない値です。許可値: ${schema.enum.join(', ')}`,
    })
  }

  if (schema.type === 'object' && isObject(value)) {
    for (const requiredKey of schema.required ?? []) {
      if (!(requiredKey in value)) {
        issues.push({
          path: joinPointer(at, requiredKey),
          message: '必須フィールドがありません。',
        })
      }
    }

    for (const [key, nestedValue] of Object.entries(value)) {
      const nestedSchema = schema.properties?.[key]
      if (!nestedSchema) {
        if (schema.additionalProperties === false) {
          issues.push({
            path: joinPointer(at, key),
            message: '未定義のフィールドです。',
          })
        }
        continue
      }

      issues.push(
        ...validateJsonSchema(nestedValue, nestedSchema, joinPointer(at, key)),
      )
    }
  }

  if (schema.type === 'array' && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => {
      issues.push(
        ...validateJsonSchema(
          item,
          schema.items!,
          joinPointer(at, String(index)),
        ),
      )
    })
  }

  return issues
}

function matchesType(value: JsonValue, type: NonNullable<JsonSchema['type']>) {
  if (type === 'array') {
    return Array.isArray(value)
  }
  if (type === 'object') {
    return isObject(value)
  }
  return typeof value === type
}

function isObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function deepEqual(left: JsonValue, right: JsonValue) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function joinPointer(base: string, key: string) {
  const escaped = key.replaceAll('~', '~0').replaceAll('/', '~1')
  return base === '/' ? `/${escaped}` : `${base}/${escaped}`
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
  ].filter((line): line is string => Boolean(line))

  return listLines(actions, '次アクションなし。')
}

function defaultRunId() {
  const compactTimestamp = new Date()
    .toISOString()
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace(/\.\d{3}Z$/, 'Z')
  const suffix = Math.random().toString(36).slice(2, 8)
  return `run-${compactTimestamp}-${suffix}`
}

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

  return readFileSync(governancePath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as { kind?: string; message?: string }
      } catch {
        return null
      }
    })
    .filter(
      (event): event is { kind?: string; message: string } =>
        typeof event?.message === 'string' && event.message.length > 0,
    )
    .map((event) => ({
      source: `governance:${event.kind ?? 'manual'}`,
      summary: event.message,
      status: 'candidate',
      target: learningTargetForSummary(event.message),
    }))
}

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
    const check = checks[name]!
    const findings = findingsForCategory(name, sourceFindings, securityFindings)
    const ok = check.ok
    return {
      name,
      status: ok ? 'covered' : 'review',
      evidence: check.evidence,
      notes: ok ? 'deterministic check passed' : '確認または同期が必要です。',
      score: ok ? 10 : 4,
      max_score: 10,
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
    (total, category) => total + (category.max_score ?? 10),
    0,
  )
  return { maxScore, overallScore }
}

function topActionLines(
  categories: ScorecardRecord[],
  extraFindings: (SecurityFinding | string)[] = [],
) {
  const categoryActions = categories
    .filter((category) => (category.score ?? 0) < (category.max_score ?? 10))
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
  return [...categoryActions, ...extraActions].slice(0, 3)
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
    const checks: Array<[RegExp, string, string, boolean]> = [
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

function readPackageScriptNames(projectRoot: string) {
  const packageJsonPath = path.join(projectRoot, 'package.json')
  if (!existsSync(packageJsonPath)) {
    return []
  }

  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      scripts?: Record<string, string>
    }
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
      .map((line) => line.slice(3).trim())
      .filter(Boolean)
      .map((line) => line.replace(/^"|"$/g, ''))
      .toSorted()
  } catch {
    return []
  }
}

function validationIssueLines(result: HarnessValidationResult) {
  if (result.ok) {
    return ['- schema 検証は通過しました。']
  }

  return result.issues.map(
    (issue) => `- ${issue.file}${issue.path}: ${issue.message}`,
  )
}

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

function toProjectRelativePath(projectRoot: string, filePath: string) {
  const relative = path.relative(projectRoot, filePath)
  return relative.length > 0 ? relative : '.'
}

export {
  collectLearningCandidates,
  getErrorMessage,
  listLines,
  oneLine,
  readGovernanceLearningCandidates,
  summarizeScore,
  toProjectRelativePath,
  topActionLines,
  validateJsonSchema,
  validationIssueLines,
}
