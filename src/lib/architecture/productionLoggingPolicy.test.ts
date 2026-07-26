import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

type OxlintConfig = {
  overrides?: {
    files?: string[]
    rules?: Record<string, unknown>
  }[]
}

const repoRoot = resolve(import.meta.dirname, '../../..')

describe('issue #715: production logging policy', () => {
  it.each([
    'src/entrypoints/background.ts',
    'src/lib/background/expired-tabs.ts',
    'src/lib/background/message-handler.ts',
  ])('%s は direct console を使わない', (relativePath) => {
    const source = readFileSync(resolve(repoRoot, relativePath), 'utf8')

    expect(source).not.toMatch(/\bconsole\.(?:debug|error|info|log|warn)\b/u)
  })

  it('Oxlint が migrated production boundary の direct console を禁止する', () => {
    const config = JSON.parse(
      readFileSync(resolve(repoRoot, '.oxlintrc.json'), 'utf8'),
    ) as OxlintConfig
    const override = config.overrides?.find((entry) =>
      entry.files?.includes('src/lib/background/message-handler.ts'),
    )

    expect(override?.files).toContain('src/entrypoints/background.ts')
    expect(override?.files).toContain('src/lib/background/expired-tabs.ts')
    expect(override?.rules?.['eslint/no-console']).toBe('error')
  })

  it('production build が legacy direct console を削除する', () => {
    const configSource = readFileSync(
      resolve(repoRoot, 'wxt.config.ts'),
      'utf8',
    )

    expect(configSource).toContain("env.mode === 'production'")
    expect(configSource).toContain("drop: ['console', 'debugger']")
    expect(configSource).toContain("minify: 'esbuild'")
  })

  it('domain / application から logging runtime への依存を禁止する', () => {
    const configSource = readFileSync(
      resolve(repoRoot, '.dependency-cruiser.cjs'),
      'utf8',
    )

    expect(configSource).toContain("name: 'no-domain-application-to-logging'")
  })

  it('成果物がない場合も production logging verifier が明示的に失敗する', () => {
    const verifierSource = readFileSync(
      resolve(repoRoot, 'tools/scripts/verify-production-logging.ts'),
      'utf8',
    )

    expect(verifierSource).toContain('existsSync(outputRoot)')
    expect(verifierSource).toContain('Production output is missing:')
  })
})
