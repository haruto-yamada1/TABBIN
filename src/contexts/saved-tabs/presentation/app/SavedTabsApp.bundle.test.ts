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

  it('imports the bulk custom-project removal helper used by the delete flow', () => {
    const componentSource = readSavedTabsAppSource('./SavedTabsApp.tsx')
    const helpersSource = readSavedTabsAppSource('./savedTabsApp.helpers.ts')

    const modulePath = '@/lib/storage/projects'
    const symbol = 'removeUrlsFromAllCustomProjects'

    expect(
      hasImportFromModule(componentSource, modulePath, symbol) ||
        hasImportFromModule(helpersSource, modulePath, symbol),
    ).toBe(true)
  })
})
