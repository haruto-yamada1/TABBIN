import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

import { assertFirefoxSourceContract } from './firefoxSourceContract.ts'

const projectRoot = path.resolve(import.meta.dirname, '..', '..')
const srcRoot = path.join(projectRoot, 'src')

// Test fixtures, storybook stories, and test support files intentionally
// embed chrome-extension:// literals because they exercise Chrome runtime
// contracts directly. The contract is enforced on production source only.
const isExcluded = (relativePath: string): boolean =>
  /\.(test|spec)\.(ts|tsx)$/.test(relativePath) ||
  /\.stories\.(ts|tsx)$/.test(relativePath) ||
  relativePath.includes(`${path.sep}test${path.sep}`) ||
  relativePath.includes(`${path.sep}storybook${path.sep}`)

const walk = (dir: string, base: string): string[] => {
  const entries = readdirSync(dir)
  const files: string[] = []
  for (const entry of entries) {
    const absolute = path.join(dir, entry)
    const relative = path.relative(base, absolute)
    const stat = statSync(absolute)
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') {
        continue
      }
      files.push(...walk(absolute, base))
    } else if (
      (absolute.endsWith('.ts') || absolute.endsWith('.tsx')) &&
      !isExcluded(relative)
    ) {
      files.push(absolute)
    }
  }
  return files
}

const violations: string[] = []
for (const file of walk(srcRoot, srcRoot)) {
  const source = readFileSync(file, 'utf8')
  try {
    assertFirefoxSourceContract({
      source,
      filePath: path.relative(projectRoot, file),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    violations.push(message)
  }
}

if (violations.length > 0) {
  throw new Error(
    `Firefox source contract failed (${violations.length} files):\n${violations.join('\n\n')}`,
  )
}

console.log('verified: src/** passes Firefox source contract')
