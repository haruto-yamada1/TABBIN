#!/bin/sh
set -eu

project_dir="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$project_dir"

case ",${TABBIN_HARNESS_DISABLED_HOOKS:-}," in
  *,profile-gate,*) exit 0 ;;
esac

mkdir -p .agents/harness

node <<'NODE'
const fs = require('fs')
const path = require('path')

const profile = process.env.TABBIN_HARNESS_PROFILE || 'standard'
const disabled = process.env.TABBIN_HARNESS_DISABLED_HOOKS || ''
const outputPath = path.join(process.cwd(), '.agents/harness/profile.json')
const payload = {
  hook_id: 'profile-gate',
  profile,
  disabled_hook_ids: disabled
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
  updated_at: new Date().toISOString(),
}

fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`)

if (profile !== 'standard') {
  console.error(`Harness profile: ${profile}`)
}
if (disabled) {
  console.error(`Harness disabled hook IDs: ${disabled}`)
}
NODE
