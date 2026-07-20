import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Issue #794 Step 1: Waza version と checksum の管理方式が矛盾しないことを検証する。
// Option A (完全固定) を採用し、workflow_dispatch の version input を廃止した。
// version と checksum は本 workflow 内で一対で固定され、外部 input で片方だけ
// 変更できる状態 (矛盾状態) になっていないことを契約として保証する。

const projectRoot = path.resolve(import.meta.dirname, '..', '..')

const readProjectFile = (relativePath: string): string =>
  readFileSync(path.join(projectRoot, relativePath), 'utf8')

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
    expect(workflow).toContain("WAZA_VERSION: 'v0.38.3'")
  })

  it('poc workflow pins a checksum that matches the known v0.38.3 linux-amd64 checksum', () => {
    const workflow = readProjectFile(POC_WORKFLOW)
    // CI は ubuntu-latest (linux-amd64) を使うので、その checksum と一致する必要がある。
    expect(workflow).toContain(V0_38_3_CHECKSUMS['waza-linux-amd64'])
    // checksum は EXPECT_SHA env として単一定義される。
    const shaMatches = [...workflow.matchAll(/EXPECT_SHA:\s'[0-9a-f]{64}'/g)]
    expect(shaMatches).toHaveLength(1)
  })

  it('the pinned checksum in the workflow matches the README checksum table', () => {
    const readme = readProjectFile('evals/skills/check/README.md')
    expect(readme).toContain('waza-linux-amd64')
    expect(readme).toContain(V0_38_3_CHECKSUMS['waza-linux-amd64'])
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
