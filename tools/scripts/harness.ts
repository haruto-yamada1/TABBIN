#!/usr/bin/env bun

import {
  buildHarnessAudit,
  buildHarnessProfile,
  buildHarnessSurfaceAudit,
  buildHarnessStatusMarkdown,
  checkpointHarnessRun,
  evaluateHarnessRun,
  initializeHarnessRun,
  learnFromHarnessRun,
  planHarnessRun,
  recordHarnessGovernanceEvent,
  validateHarnessRun,
  writeHarnessStatusSnapshot,
  writeHarnessSchemaFiles,
} from '../../src/lib/harness/harnessState'

type CommandName =
  | 'audit'
  | 'checkpoint'
  | 'evaluate'
  | 'governance'
  | 'learn'
  | 'plan'
  | 'profile'
  | 'schemas'
  | 'start'
  | 'status'
  | 'surface-audit'
  | 'validate'

const args = process.argv.slice(2)
const command = args[0] as CommandName | undefined
const projectRoot = process.cwd()
const runId = readOption('--run')

if (
  !command ||
  ![
    'audit',
    'checkpoint',
    'evaluate',
    'governance',
    'learn',
    'plan',
    'profile',
    'schemas',
    'start',
    'status',
    'surface-audit',
    'validate',
  ].includes(command)
) {
  printUsage()
  process.exit(1)
}

if (command === 'governance') {
  const result = recordHarnessGovernanceEvent({
    projectRoot,
    runId,
    event: {
      kind: readOption('--kind') ?? 'manual',
      severity: readOption('--severity') ?? 'info',
      source: readOption('--source') ?? 'harness-cli',
      message: readOption('--message') ?? args.slice(1).join(' ').trim(),
    },
  })
  console.log(`harness: governance event recorded (${result.path})`)
  process.exit(0)
}

if (command === 'start') {
  const task = readOption('--task') ?? args.slice(1).join(' ').trim()
  if (!task) {
    console.error('harness: start には --task または task text が必要です。')
    process.exit(1)
  }

  const result = initializeHarnessRun({
    projectRoot,
    runId,
    task,
  })
  console.log(`harness: started (${result.runId})`)
  console.log(result.runDirectory)
  process.exit(0)
}

if (command === 'validate') {
  const result = validateHarnessRun({ projectRoot, runId })
  if (result.ok) {
    console.log(`harness: valid (${result.runId})`)
    process.exit(0)
  }

  console.error(`harness: invalid (${result.runId ?? 'no active run'})`)
  for (const issue of result.issues) {
    console.error(`- ${issue.file}${issue.path}: ${issue.message}`)
  }
  process.exit(1)
}

if (command === 'plan') {
  const result = planHarnessRun({
    projectRoot,
    runId,
    summary: readOption('--summary'),
    nextAction: readOption('--next-action'),
    tasks: readOptions('--task'),
  })
  console.log(`harness: planner updated (${result.path})`)
  process.exit(0)
}

if (command === 'checkpoint') {
  const commandText = readOption('--command')
  const notes = readOption('--notes')
  const status = readOption('--status') ?? 'recorded'
  if (!commandText || !notes) {
    console.error('harness: checkpoint には --command と --notes が必要です。')
    process.exit(1)
  }

  const result = checkpointHarnessRun({
    projectRoot,
    runId,
    command: commandText,
    status,
    notes,
    summary: readOption('--summary'),
    nextAction: readOption('--next-action'),
  })
  console.log(`harness: checkpoint recorded (${result.path})`)
  process.exit(0)
}

if (command === 'evaluate') {
  const result = evaluateHarnessRun({
    projectRoot,
    runId,
    summary: readOption('--summary'),
    nextAction: readOption('--next-action'),
  })
  console.log(`harness: evaluator prepared (${result.path})`)
  process.exit(0)
}

if (command === 'status') {
  if (args.includes('--write')) {
    const result = writeHarnessStatusSnapshot({ projectRoot, runId })
    console.log(`harness: status snapshot written (${result.path})`)
    process.exit(0)
  }
  console.log(buildHarnessStatusMarkdown({ projectRoot, runId }))
  process.exit(0)
}

if (command === 'audit') {
  console.log(buildHarnessAudit({ projectRoot, runId }))
  process.exit(0)
}

if (command === 'surface-audit') {
  console.log(buildHarnessSurfaceAudit({ projectRoot, runId }))
  process.exit(0)
}

if (command === 'learn') {
  const result = learnFromHarnessRun({ projectRoot, runId })
  console.log(`harness: learning candidates written (${result.path})`)
  process.exit(0)
}

if (command === 'profile') {
  console.log(buildHarnessProfile({ projectRoot, runId }))
  process.exit(0)
}

writeHarnessSchemaFiles(projectRoot)
console.log('harness: schemas written')

function readOption(name: string) {
  const index = args.indexOf(name)
  if (index === -1) {
    return undefined
  }

  return args[index + 1]
}

function readOptions(name: string) {
  const values: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name && args[index + 1]) {
      values.push(args[index + 1])
    }
  }
  return values
}

function printUsage() {
  console.error(
    [
      'usage: bun tools/scripts/harness.ts <command> [--run <id>]',
      '',
      'commands:',
      '  start     run を作成し、ACTIVE / task.md / orchestrator.json を初期化する',
      '  plan      planner.json と orchestrator.json の plan を更新する',
      '  checkpoint generator.json に検証 checkpoint を追記する',
      '  evaluate  fresh-context Evaluator 起動用の evaluator.json を準備する',
      '  validate  ACTIVE run の JSON 状態を schema 検証する',
      '  status    ACTIVE run の Markdown handoff を出力する',
      '  audit     変更ファイル、証跡、follow-up 候補を確認する',
      '  surface-audit deterministic scorecard と APM 同期を確認する',
      '  learn     evaluator / governance から learning.json を更新する',
      '  profile   agent / hook / command surface を表示する',
      '  governance governance.jsonl に判断・警告・学習候補を記録する',
      '  schemas   .apm/harness/schemas を再生成する',
      '',
      'examples:',
      '  bun tools/scripts/harness.ts start --task "X 投稿機能を作る"',
      '  bun tools/scripts/harness.ts start --run run-x-post --task "X 投稿機能を作る"',
    ].join('\n'),
  )
}
