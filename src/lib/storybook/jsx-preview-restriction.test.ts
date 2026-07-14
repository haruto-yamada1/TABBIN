// @vitest-environment node
// Regression guard for issue #658 — JSXPreview must stay Storybook/dev-only.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..')

const readJson = (relativePath: string) =>
  JSON.parse(readFileSync(path.join(repoRoot, relativePath), 'utf8')) as Record<
    string,
    unknown
  >

const walkSrc = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const fullPath = path.join(dir, entry)
    const stats = statSync(fullPath)

    if (stats.isDirectory()) {
      return walkSrc(fullPath)
    }

    if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      return [fullPath]
    }

    return []
  })

const normalizePath = (filePath: string) =>
  path.relative(repoRoot, filePath).replaceAll(path.sep, '/')

const jsxPreviewPath = 'src/components/ai-elements/jsx-preview.tsx'

const srcRoot = path.join(repoRoot, 'src')
const allSrcFiles = walkSrc(srcRoot).map(normalizePath)

// Files that are allowed to import jsx-preview:
//   - the component itself (internal imports)
//   - anything under src/lib/storybook/ (dev-only Storybook harness)
const isAllowedImporter = (normalizedPath: string) =>
  normalizedPath === jsxPreviewPath ||
  normalizedPath.startsWith('src/lib/storybook/')

describe('JSXPreview Storybook/dev-only restriction (issue #658)', () => {
  it('keeps react-jsx-parser in devDependencies, not dependencies', () => {
    const packageJson = readJson('package.json') as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }

    expect(packageJson.dependencies?.['react-jsx-parser']).toBeUndefined()
    expect(packageJson.devDependencies?.['react-jsx-parser']).toBeDefined()
  })

  it('only allows jsx-preview imports from src/lib/storybook', () => {
    const importPattern = /(?:from\s+|import\s*\()['"]@?\/?.*jsx-preview['")]/u
    const dynamicImportPattern = /import\s*\(\s*['"][^'"]*jsx-preview['"]\s*\)/u

    const violators = allSrcFiles.filter((normalizedPath) => {
      if (isAllowedImporter(normalizedPath)) {
        return false
      }

      const contents = readFileSync(path.join(repoRoot, normalizedPath), 'utf8')

      return importPattern.test(contents) || dynamicImportPattern.test(contents)
    })

    expect(violators).toStrictEqual([])
  })

  it('declares the no-jsx-preview-outside-storybook depcruise rule', () => {
    const depcruiseConfig = readFileSync(
      path.join(repoRoot, '.dependency-cruiser.cjs'),
      'utf8',
    )

    expect(depcruiseConfig).toContain('no-jsx-preview-outside-storybook')
    expect(depcruiseConfig).toContain('jsx-preview')
  })
})
