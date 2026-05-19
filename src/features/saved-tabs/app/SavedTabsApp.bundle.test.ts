import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

describe('SavedTabsApp bundling', () => {
  it('does not lazily import storage modules already loaded statically', () => {
    const source = readFileSync(
      resolve(__dirname, './SavedTabsApp.tsx'),
      'utf8',
    )

    expect(source).not.toContain("await import('@/lib/storage/tabs')")
    expect(source).not.toContain("await import('@/lib/storage/projects')")
  })

  it('imports the bulk custom-project removal helper used by the delete flow', () => {
    const source = readFileSync(
      resolve(__dirname, './SavedTabsApp.tsx'),
      'utf8',
    )

    expect(source).toMatch(
      /import\s*\{[\s\S]*removeUrlsFromAllCustomProjects[\s\S]*\}\s*from\s*'@\/lib\/storage\/projects'/,
    )
  })
})
