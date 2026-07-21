import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Issue #794 Step 1 / Issue #799 Step 8: Waza version と checksum の管理方式が
// 矛盾しないことを検証する。Option A (完全固定) を採用し、workflow_dispatch の
// version input を廃止した。version と checksum は本 workflow 内で一対で固定され、
// 外部 input で片方だけ変更できる状態 (矛盾状態) になっていないことを保証する。
//
// Issue #799: 整合性テストを全 Workflow (3 つ) に拡張する。

const projectRoot = path.resolve(import.meta.dirname, '..', '..')

const readProjectFile = (relativePath: string): string =>
  readFileSync(path.join(projectRoot, relativePath), 'utf8')

// Issue #799: 全 Waza workflow を対象にする
const WAZA_WORKFLOWS = [
  '.github/workflows/waza-eval-poc.yml',
  '.github/workflows/waza-skill-eval.yml',
  '.github/workflows/waza-real-agent-eval.yml',
] as const

const POC_WORKFLOW = '.github/workflows/waza-eval-poc.yml'

// v0.38.3 release の asset ごとの sha256 (evals/skills/check/README.md と同一 source)。
const V0_38_3_CHECKSUMS = {
  'waza-darwin-amd64':
    'f2a0c6952abbb5ad75bf17e2769c34c480093c269574839368b82d40b3c5dec9',
  'waza-darwin-arm64':
    '99aa4366b198f319145cffeef42d500eb9f6178235a0537d34c19dd8f2f46fec',
  'waza-linux-amd64':
    '168e3562deeaa1958d44366b37d963b48b091c325c6c9b5b2613e5399ff077b9',
  'waza-linux-arm64':
    'ab5d6a3e502a0f7f5a48149e034fa07875a2fe02addddec6b9b9dba14f3b4685',
  'waza-windows-amd64.exe':
    'b2f7c84dfd8df44a6eb962385b37976c59637c96f0a9b34cf7328e8ababc5b88',
  'waza-windows-arm64.exe':
    'b867521c70ae817fed827d0de6bde4ce927cd7df9be5214d7033ae82ed14c891',
} as const

const PINNED_VERSION = 'v0.38.3'
const PINNED_LINUX_CHECKSUM = V0_38_3_CHECKSUMS['waza-linux-amd64']

describe('waza version / checksum management (Issue #794 Step 1, Option A)', () => {
  it('poc workflow no longer exposes a waza_version input', () => {
    const workflow = readProjectFile(POC_WORKFLOW)
    // workflow_dispatch inputs に waza_version があってはならない。
    expect(workflow).not.toMatch(/waza_version/)
    // run_adversarial のみ残るべき。
    expect(workflow).toContain('run_adversarial')
  })

  it('poc workflow pins exactly one Waza version', () => {
    const workflow = readProjectFile(POC_WORKFLOW)
    // version は env で単一の固定値として定義される。
    const versionMatches = [
      ...workflow.matchAll(/WAZA_VERSION:\s*'v\d+\.\d+\.\d+'/g),
    ]
    expect(versionMatches).toHaveLength(1)
    expect(workflow).toContain(`WAZA_VERSION: '${PINNED_VERSION}'`)
  })

  it('poc workflow pins a checksum that matches the known v0.38.3 linux-amd64 checksum', () => {
    const workflow = readProjectFile(POC_WORKFLOW)
    // CI は ubuntu-latest (linux-amd64) を使うので、その checksum と一致する必要がある。
    expect(workflow).toContain(PINNED_LINUX_CHECKSUM)
    // checksum は EXPECT_SHA env として単一定義される。
    const shaMatches = [...workflow.matchAll(/EXPECT_SHA:\s'[0-9a-f]{64}'/g)]
    expect(shaMatches).toHaveLength(1)
  })

  it('the pinned checksum in the workflow matches the README checksum table', () => {
    const readme = readProjectFile('evals/skills/check/README.md')
    expect(readme).toContain('waza-linux-amd64')
    expect(readme).toContain(PINNED_LINUX_CHECKSUM)
  })

  it('the README documents every v0.38.3 asset checksum', () => {
    const readme = readProjectFile('evals/skills/check/README.md')
    for (const [asset, sha] of Object.entries(V0_38_3_CHECKSUMS)) {
      expect(readme, `README missing ${asset}`).toContain(asset)
      expect(readme, `README missing checksum for ${asset}`).toContain(sha)
    }
  })

  it('.waza.yaml schema URL version matches the pinned workflow version', () => {
    const wazaYaml = readProjectFile('.waza.yaml')
    expect(wazaYaml).toContain(
      'microsoft/waza/v0.38.3/schemas/config.schema.json',
    )
  })
})

describe('waza version / checksum consistency across all workflows (Issue #799 Step 8)', () => {
  // Issue #799: 全 3 Workflow で version と checksum が一致することを検証する。

  it('every workflow that installs Waza pins the same version', () => {
    for (const workflowPath of WAZA_WORKFLOWS) {
      const workflow = readProjectFile(workflowPath)
      // Skip workflows that don't install Waza directly
      if (!workflow.includes('WAZA_VERSION')) {
        continue
      }
      expect(
        workflow,
        `${workflowPath} must pin WAZA_VERSION: '${PINNED_VERSION}'`,
      ).toContain(`WAZA_VERSION: '${PINNED_VERSION}'`)
    }
  })

  it('every workflow that installs Waza pins the same linux-amd64 checksum', () => {
    for (const workflowPath of WAZA_WORKFLOWS) {
      const workflow = readProjectFile(workflowPath)
      if (!workflow.includes('EXPECT_SHA')) {
        continue
      }
      expect(
        workflow,
        `${workflowPath} must pin EXPECT_SHA: '${PINNED_LINUX_CHECKSUM}'`,
      ).toContain(`EXPECT_SHA: '${PINNED_LINUX_CHECKSUM}'`)
    }
  })

  it('every workflow that installs Waza pins exactly one version', () => {
    for (const workflowPath of WAZA_WORKFLOWS) {
      const workflow = readProjectFile(workflowPath)
      const versionMatches = [
        ...workflow.matchAll(/WAZA_VERSION:\s*'v\d+\.\d+\.\d+'/g),
      ]
      if (versionMatches.length === 0) {
        continue
      }
      expect(
        versionMatches,
        `${workflowPath} must have exactly one WAZA_VERSION`,
      ).toHaveLength(1)
    }
  })

  it('every workflow that installs Waza pins exactly one checksum', () => {
    for (const workflowPath of WAZA_WORKFLOWS) {
      const workflow = readProjectFile(workflowPath)
      const shaMatches = [...workflow.matchAll(/EXPECT_SHA:\s'[0-9a-f]{64}'/g)]
      if (shaMatches.length === 0) {
        continue
      }
      expect(
        shaMatches,
        `${workflowPath} must have exactly one EXPECT_SHA`,
      ).toHaveLength(1)
    }
  })
})

describe('waza real-agent-eval workflow contract (Issue #799 Step 1)', () => {
  // Issue #799: waza run は --executor / --on-unsafe-outcome を受け付けない。
  // executor は eval.real.yaml の config.executor で指定する。

  it('real-agent-eval does not use --executor with waza run', () => {
    const workflow = readProjectFile(WAZA_WORKFLOWS[2])
    expect(workflow).not.toMatch(/waza run[\s\S]*?--executor/)
  })

  it('real-agent-eval does not use --on-unsafe-outcome with waza run', () => {
    const workflow = readProjectFile(WAZA_WORKFLOWS[2])
    // --on-unsafe-outcome is only valid for waza adversarial, not waza run
    expect(workflow).not.toMatch(/waza run[\s\S]*?--on-unsafe-outcome/)
  })

  it('real-agent-eval uses eval.real.yaml (not eval.yaml) for real-model eval', () => {
    const workflow = readProjectFile(WAZA_WORKFLOWS[2])
    expect(workflow).toContain('eval.real.yaml')
  })

  it('real-agent-eval enables session logging and transcript output', () => {
    const workflow = readProjectFile(WAZA_WORKFLOWS[2])
    expect(workflow).toContain('--session-log')
    expect(workflow).toContain('--session-dir')
    expect(workflow).toContain('--transcript-dir')
  })

  it('real-agent-eval validates skill input against an allowlist', () => {
    const workflow = readProjectFile(WAZA_WORKFLOWS[2])
    expect(workflow).toContain('ALLOWED_SKILLS')
    // path traversal prevention: skill name must be in allowlist
    expect(workflow).toMatch(/grep -qw/)
  })

  it('real-agent-eval distinguishes skip from success in status JSON', () => {
    const workflow = readProjectFile(WAZA_WORKFLOWS[2])
    // skip must have executed: false
    expect(workflow).toContain('"executed": false')
    expect(workflow).toContain('skipped_missing_credentials')
    // success must have executed: true
    expect(workflow).toContain('"executed": true')
    expect(workflow).toContain('"classification": "success"')
  })

  it('real-agent-eval runs trace evaluation after waza run', () => {
    const workflow = readProjectFile(WAZA_WORKFLOWS[2])
    expect(workflow).toContain('evaluate-waza-trace.ts')
    expect(workflow).toContain('--intent read-only')
  })

  it('real-agent-eval overrides classification to unsafe_trace_violation when trace fails (Issue #799 review)', () => {
    const workflow = readProjectFile(WAZA_WORKFLOWS[2])
    // When trace_passed is False and classification was success,
    // the workflow must override to unsafe_trace_violation
    expect(workflow).toContain('unsafe_trace_violation')
    expect(workflow).toContain('UNSAFE TRACE VIOLATION')
  })
})

describe('run-waza-eval adversarial does not override fail to warn (Issue #799 Step 6)', () => {
  it('the adversarial command does not pass --on-unsafe-outcome warn', () => {
    const script = readProjectFile('tools/scripts/run-waza-eval.ts')
    // The wrapper must not override the eval.yaml's on_unsafe_outcome: fail
    // by passing --on-unsafe-outcome warn
    expect(script).not.toMatch(/--on-unsafe-outcome.*warn/)
  })
})

describe('waza-skill-eval adversarial handling (Issue #799 Step 6)', () => {
  it('treats exit code 2 (unsafe) as UNSAFE not FAIL (non-blocking for Layer 2)', () => {
    const workflow = readProjectFile('.github/workflows/waza-skill-eval.yml')
    // exit code 2 is "unsafe outcome detected" — must not be shown as "ok"
    expect(workflow).toContain('UNSAFE')
    // Layer 2 is non-blocking: UNSAFE must not set fail=1
    expect(workflow).not.toMatch(/\[ "\$ad" = UNSAFE \] && fail=1/)
    // But FAIL (other non-zero exit) must set fail=1
    expect(workflow).toContain('[ "$ad" = FAIL ] && fail=1')
  })

  it('waza-eval-poc adversarial is non-blocking (continue-on-error)', () => {
    const workflow = readProjectFile('.github/workflows/waza-eval-poc.yml')
    expect(workflow).toContain('continue-on-error: true')
  })
})

describe('real-model eval spec contract (Issue #799 Step 2)', () => {
  it('github-pr-review has a real-model eval spec (eval.real.yaml)', () => {
    const spec = readProjectFile('evals/skills/github-pr-review/eval.real.yaml')
    expect(spec).toContain('executor: copilot-sdk')
    expect(spec).toContain('on_unsafe_outcome: fail')
  })

  it('mock eval spec still uses mock executor', () => {
    const spec = readProjectFile('evals/skills/github-pr-review/eval.yaml')
    expect(spec).toContain('executor: mock')
  })

  it('real spec does not contain real secrets', () => {
    const spec = readProjectFile('evals/skills/github-pr-review/eval.real.yaml')
    // provider secret must not be in the spec file
    expect(spec).not.toContain('WAZA_MODEL_API_KEY')
    expect(spec).not.toMatch(/api[_-]?key:\s*['"]/i)
  })
})
