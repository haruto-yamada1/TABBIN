#!/bin/sh
set -eu

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$project_dir"

node <<'NODE'
const fs = require('fs')
const path = require('path')

const projectDir = process.cwd()
const activePath = path.join(projectDir, '.agents/harness/ACTIVE')

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

if (!fs.existsSync(activePath)) {
  process.exit(0)
}

const active = fs.readFileSync(activePath, 'utf8').trim()
const runDir = resolveRunDir(active)
if (!runDir || !fs.existsSync(runDir)) {
  console.error(`Harness: ACTIVE run が見つかりません: ${active}`)
  process.exit(0)
}

const orchestrator = readJson(path.join(runDir, 'orchestrator.json'))
const planner = readJson(path.join(runDir, 'planner.json'))
const generator = readJson(path.join(runDir, 'generator.json'))
const evaluator = readJson(path.join(runDir, 'evaluator.json'))
const nextAction =
  evaluator?.next_action ||
  planner?.next_action ||
  orchestrator?.next_action ||
  generator?.next_action ||
  '必要に応じて `bun run harness:status` を確認してください。'

console.error(
  [
    `Harness: active run ${path.basename(runDir)}`,
    `Orchestrator: ${orchestrator?.status || '未記録'}`,
    `Planner: ${planner?.status || '未記録'}`,
    `Generator: ${generator?.status || '未記録'}`,
    `Evaluator: ${evaluator?.status || '未記録'}`,
    `Next: ${nextAction}`,
  ].join('\n'),
)
NODE
