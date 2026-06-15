import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest' // eslint-disable-line

const readSavedTabsAppSource = (fileName: string): string =>
  readFileSync(resolve(__dirname, fileName), 'utf8')

const hasImportFromModule = (
  source: string,
  modulePath: string,
  symbol: string,
): boolean => {
  const escapedModulePath = modulePath.replace(/\//g, String.raw`\/`)
  const importPattern = new RegExp(
    `import\\s*\\{[^}]*${symbol}[^}]*\\}\\s*from\\s*'${escapedModulePath}'`,
    's',
  )
  return importPattern.test(source)
}

describe('SavedTabsApp bundling', () => {
  it('does not lazily import storage modules already loaded statically', () => {
    const source = readSavedTabsAppSource('./SavedTabsApp.tsx')

    expect(source).not.toContain("await import('@/lib/storage/tabs')")
    expect(source).not.toContain("await import('@/lib/storage/projects')")
  })

  it('@/lib/storage/projects を直接 import しない (issue #509)', () => {
    // 旧 `removeUrlsFromAllCustomProjects` は
    // `CustomProjectsCommandService.removeUrlsFromAllCustomProjects`
    // 経由へ置換済み。presentation 層は port interface だけ参照する。
    const componentSource = readSavedTabsAppSource('./SavedTabsApp.tsx')
    const helpersSource = readSavedTabsAppSource('./savedTabsApp.helpers.ts')
    expect(componentSource).not.toMatch(
      /from\s*'@\/lib\/storage\/projects'/,
    )
    expect(helpersSource).not.toMatch(
      /from\s*'@\/lib\/storage\/projects'/,
    )
  })
})
