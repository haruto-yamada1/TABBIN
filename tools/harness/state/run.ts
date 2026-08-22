import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import {
  readJsonFile,
  readStateIfExists,
  readTextIfExists,
  writeJsonFile,
} from './io'
import {
  learningTargetForFinding,
  readGovernanceLearningCandidates,
} from './learning'
import { harnessSchemas, validateJsonSchema } from './schemas'
import { surfaceAuditCategoryNames } from './scorecard'
import { harnessRoot, RUN_ID_SUFFIX_LENGTH, runRoot } from './types'
import type {
  HarnessCheckpointOptions,
  HarnessEvaluateOptions,
  HarnessFileResult,
  HarnessGovernanceEvent,
  HarnessPlanOptions,
  HarnessRunOptions,
  HarnessSnapshot,
  HarnessValidationIssue,
  HarnessValidationResult,
  InitializeHarnessRunOptions,
  InitializeHarnessRunResult,
  LearningRecord,
} from './types'

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

  if (!path.isAbsolute(runIdOrPath) && runIdOrPath.includes('..')) {
    throw new Error('runId に相対パス区切り文字を含めることはできません。')
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

function defaultRunId() {
  const compactTimestamp = new Date()
    .toISOString()
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace(/\.\d{3}Z$/, 'Z')
  const BASE36_RADIX = 36

  const suffix = Math.random()
    .toString(BASE36_RADIX)
    .slice(2, RUN_ID_SUFFIX_LENGTH)
  return `run-${compactTimestamp}-${suffix}`
}

export function initializeHarnessRun(
  options: InitializeHarnessRunOptions,
): InitializeHarnessRunResult {
  const runId = options.runId ?? defaultRunId()
  if (runId.includes('/') || runId.includes('..')) {
    throw new Error('runId にパス区切り文字を含めることはできません。')
  }

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

  for (const [fileName, schema] of Object.entries(harnessSchemas)) {
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
      ...validateJsonSchema(parsed.value, schema).map((issue) => ({
        file: fileName,
        path: issue.path,
        message: issue.message,
      })),
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

export function recordHarnessGovernanceEvent(options: {
  event: HarnessGovernanceEvent
  projectRoot: string
  runId?: string
}): HarnessFileResult {
  const resolved = resolveHarnessRun({
    projectRoot: options.projectRoot,
    ...(options.runId !== undefined ? { runId: options.runId } : {}),
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

export {
  defaultRunId,
  loadHarnessSnapshot,
  readActiveRun,
  requireHarnessRun,
  resolveHarnessRun,
}

export type { HarnessSnapshot }
