import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
/** @type {Array<[string, string, RegExp | null]>} */
const cases = [
  ['lint', 'valid', null],
  ['security', 'valid', null],
  ['lint', 'invalid-expression', /property.*nonexistent_property/],
  ['lint', 'invalid-needs', /job-needs/],
  ['lint', 'invalid-input', /nonexistent-input/],
  ['lint', 'invalid-output', /nonexistent-output/],
  ['lint', 'shellcheck', /shellcheck/],
  ['security', 'injection', /template-injection/],
  ['security', 'excessive-permissions', /excessive-permissions/],
  ['security', 'persisted-credentials', /artipacked/],
  ['security', 'unpinned-action', /unpinned-uses/],
  ['security', 'dangerous-trigger', /dangerous-triggers|untrusted-checkout/],
]
for (const [mode, fixture, diagnostic] of cases) {
  const result = spawnSync(
    process.execPath,
    ['tools/ci-audit/run.mjs', mode, `tools/ci-audit/fixtures/${fixture}.yml`],
    { cwd: root, encoding: 'utf8', timeout: 30_000 },
  )
  assert.ifError(result.error)
  assert.notEqual(result.status, null, 'auditor must exit normally')
  const output = result.stdout + result.stderr
  if (diagnostic) {
    assert.notEqual(result.status, 0, `${fixture} must be rejected`)
    assert.match(
      output,
      diagnostic,
      `${fixture} must fail for the intended reason`,
    )
  } else {
    assert.equal(result.status, 0, output)
  }
  console.log(`PASS ${mode}: ${fixture}`)
}
