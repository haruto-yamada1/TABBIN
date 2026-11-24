import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '..', '..')
const readmePath = path.join(projectRoot, 'README.md')
const privacyPath = path.join(projectRoot, 'PRIVACY.md')
const securityPath = path.join(projectRoot, 'SECURITY.md')
const docsRoot = path.join(projectRoot, 'docs')

const EXPECTED_ISSUES_URL = 'https://github.com/haruto-yamada1/TABBIN/issues'
const EXPECTED_STORE_URL =
  'https://chromewebstore.google.com/detail/tabbin/dljblklbpmoocinnlcejeokopmfoldaj'
const EXPECTED_CONTACT_URL = 'https://forms.gle/c9gBiF2TmgXaeU7J6'
const PLACEHOLDER_PATTERNS = [/yourusername/i, /your-username/i]

const markdownLinkPattern =
  /!?\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g

const collectMarkdownFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      return collectMarkdownFiles(absolutePath)
    }
    return entry.name.endsWith('.md') ? [absolutePath] : []
  })

const extractLinkTargets = (content: string): string[] =>
  [...content.matchAll(markdownLinkPattern)].flatMap((match) => {
    const target = match[1]
    if (!target) {
      return []
    }
    return [target.replace(/^<|>$/g, '')]
  })

const isExternalTarget = (target: string): boolean =>
  /^(?:https?:|mailto:|tel:|#)/i.test(target)

const toRelativePath = (target: string): string | null => {
  const withoutFragment = target.split('#')[0]?.split('?')[0] ?? ''
  if (withoutFragment === '') {
    return null
  }
  try {
    return decodeURIComponent(withoutFragment)
  } catch {
    return withoutFragment
  }
}

const markdownFiles = [
  readmePath,
  privacyPath,
  securityPath,
  ...collectMarkdownFiles(docsRoot),
]

describe('documentation links', () => {
  it('resolves every relative link in README, PRIVACY, SECURITY, and docs', () => {
    const missing: { file: string; target: string }[] = []

    for (const file of markdownFiles) {
      const content = readFileSync(file, 'utf8')
      for (const target of extractLinkTargets(content)) {
        if (isExternalTarget(target)) {
          continue
        }
        const relativePath = toRelativePath(target)
        if (relativePath === null) {
          continue
        }
        const resolvedPath = path.resolve(path.dirname(file), relativePath)
        if (!existsSync(resolvedPath)) {
          missing.push({
            file: path.relative(projectRoot, file),
            target,
          })
        }
      }
    }

    expect(missing).toEqual([])
  })

  it('uses the live repository owner in README links', () => {
    const readme = readFileSync(readmePath, 'utf8')

    expect(readme).toContain(`](${EXPECTED_ISSUES_URL})`)
    expect(readme).not.toMatch(
      /github\.com\/(?:yourusername|TarouTanakaYokohama)/i,
    )
  })

  it('does not keep placeholder repository URLs in documentation', () => {
    const offenders: { file: string; pattern: string }[] = []

    for (const file of markdownFiles) {
      const content = readFileSync(file, 'utf8')
      for (const pattern of PLACEHOLDER_PATTERNS) {
        if (pattern.test(content)) {
          offenders.push({
            file: path.relative(projectRoot, file),
            pattern: pattern.source,
          })
        }
      }
    }

    expect(offenders).toEqual([])
  })

  it('links to the Chrome Web Store and the support form from README', () => {
    const readme = readFileSync(readmePath, 'utf8')

    expect(readme).toContain(`](${EXPECTED_STORE_URL})`)
    expect(readme).toContain(`](${EXPECTED_CONTACT_URL})`)
  })
})
