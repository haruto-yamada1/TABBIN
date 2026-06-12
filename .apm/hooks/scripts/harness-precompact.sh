#!/bin/sh
set -eu

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$project_dir"

mkdir -p .agents/harness

node <<'NODE'
const fs = require('fs')
const path = require('path')

const projectDir = process.cwd()
const activePath = path.join(projectDir, '.agents/harness/ACTIVE')
const snapshotPath = path.join(projectDir, '.agents/harness/LAST_COMPACT.md')

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function resolveRunDir(active) {
  if (!active) {
    return null
  }
  return path.isAbsolute(active)
    ? active
    : path.join(projectDir, '.agents/harness/runs', active)
}

const active = fs.existsSync(activePath)
  ? fs.readFileSync(activePath, 'utf8').trim()
  : ''
const runDir = resolveRunDir(active)
const orchestrator = runDir ? readJson(path.join(runDir, 'orchestrator.json')) : null
const planner = runDir ? readJson(path.join(runDir, 'planner.json')) : null
const generator = runDir ? readJson(path.join(runDir, 'generator.json')) : null
const evaluator = runDir ? readJson(path.join(runDir, 'evaluator.json')) : null
const findings = Array.isArray(evaluator?.findings) ? evaluator.findings : []

const lines = [
  '# ハーネス PreCompact スナップショット',
  '',
  `- updated_at: ${new Date().toISOString()}`,
  `- active_run: ${active || 'なし'}`,
  `- orchestrator: ${orchestrator?.status || '未記録'} - ${orchestrator?.summary || 'summary なし'}`,
  `- planner: ${planner?.status || '未記録'} - ${planner?.summary || 'summary なし'}`,
  `- generator: ${generator?.status || '未記録'} - ${generator?.summary || 'summary なし'}`,
  `- evaluator: ${evaluator?.status || '未記録'} - ${evaluator?.summary || 'summary なし'}`,
  `- next_action: ${evaluator?.next_action || planner?.next_action || orchestrator?.next_action || generator?.next_action || '未記録'}`,
  '',
  '## 未解決 findings',
  ...(
    findings.length > 0
      ? findings.map((finding) => `- ${finding.summary || 'summary なし'}`)
      : ['- なし']
  ),
  '',
]

fs.writeFileSync(snapshotPath, `${lines.join('\n')}\n`)
console.error(`Harness: PreCompact snapshot saved to ${snapshotPath}`)
NODE
