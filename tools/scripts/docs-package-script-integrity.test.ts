import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '..', '..')
const docsRoot = path.join(projectRoot, 'docs')

// `docs/plans` keeps historical design and execution records. Those documents
// intentionally contain commands that were valid when they were written, so
// validating them against today's package.json would create false positives.
const EXCLUDED_DOCUMENTATION_DIRECTORIES = new Set(['plans'])

// Commands are only read from shell-like fences and inline code. Other fences
// (JSON, TypeScript, Mermaid, ...) can contain example strings that are not
// executable documentation commands.
const COMMAND_FENCE_LANGUAGES = new Set([
  '',
  'bash',
  'console',
  'sh',
  'shell',
  'text',
  'zsh',
])

const COMMAND_PATTERN = /\b(bun|npm)[ \t]+run[ \t]+([^\s`'"|);&*[\]<>]+)/gu
const SCRIPT_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:._-]*/u

type PackageManager = 'bun' | 'npm'

type CodeSegment = {
  readonly content: string
  readonly kind: 'fence' | 'inline'
  readonly line: number
}

type PackageScriptReference = {
  readonly line: number
  readonly packageManager: PackageManager
  readonly script: string
}

type MissingPackageScriptReference = PackageScriptReference & {
  readonly file: string
}

const countLineBreaks = (text: string): number => text.split('\n').length - 1

const collectMarkdownFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      if (EXCLUDED_DOCUMENTATION_DIRECTORIES.has(entry.name)) {
        return []
      }
      return collectMarkdownFiles(path.join(directory, entry.name))
    }
    return entry.name.endsWith('.md') ? [path.join(directory, entry.name)] : []
  })

const collectDocumentationFiles = (): string[] =>
  [
    path.join(projectRoot, 'README.md'),
    path.join(projectRoot, 'PRIVACY.md'),
    ...collectMarkdownFiles(docsRoot),
  ].toSorted()

const isShellCommentBoundary = (character: string | undefined): boolean =>
  character === undefined || /[\s;&|()]/u.test(character)

const stripShellComment = (line: string): string => {
  let quote: '"' | "'" | null = null
  let index = 0

  while (index < line.length) {
    const character = line[index] ?? ''

    if (quote === null) {
      if (character === '"' || character === "'") {
        quote = character
      } else if (character === '#' && isShellCommentBoundary(line[index - 1])) {
        return line.slice(0, index)
      }
    } else if (character === '\\' && quote === '"') {
      index += 2
      continue
    } else if (character === quote) {
      quote = null
    }

    index += 1
  }

  return line
}

type FenceMarker = {
  readonly character: string
  readonly language: string
  readonly length: number
}

const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})(.*)$/u

const parseFenceLine = (
  line: string,
): { readonly info: string; readonly marker: string } | null => {
  const match = FENCE_PATTERN.exec(line)
  if (match === null) {
    return null
  }
  return { info: match[2] ?? '', marker: match[1] ?? '' }
}

const isClosingFence = (line: string, fence: FenceMarker): boolean => {
  const parsed = parseFenceLine(line)
  return (
    parsed !== null &&
    parsed.marker.startsWith(fence.character) &&
    parsed.marker.length >= fence.length &&
    parsed.info.trim() === ''
  )
}

const collectFencedSegments = (
  lines: readonly string[],
): { readonly fenceLines: Set<number>; readonly segments: CodeSegment[] } => {
  const fenceLines = new Set<number>()
  const segments: CodeSegment[] = []
  let fence: FenceMarker | null = null
  let fenceContent: string[] = []
  let fenceStartLine = 0

  for (const [index, line] of lines.entries()) {
    if (fence === null) {
      const parsed = parseFenceLine(line)
      if (parsed === null) {
        continue
      }
      const info = parsed.info.trim()
      fence = {
        character: parsed.marker[0] ?? '`',
        language: (info.split(/\s+/u)[0] ?? '').toLowerCase(),
        length: parsed.marker.length,
      }
      fenceLines.add(index)
      fenceContent = []
      fenceStartLine = index + 2
      continue
    }

    fenceLines.add(index)

    if (!isClosingFence(line, fence)) {
      fenceContent.push(line)
      continue
    }

    if (COMMAND_FENCE_LANGUAGES.has(fence.language)) {
      segments.push({
        content: fenceContent.join('\n'),
        kind: 'fence',
        line: fenceStartLine,
      })
    }
    fence = null
    fenceContent = []
  }

  if (fence !== null && COMMAND_FENCE_LANGUAGES.has(fence.language)) {
    segments.push({
      content: fenceContent.join('\n'),
      kind: 'fence',
      line: fenceStartLine,
    })
  }

  return { fenceLines, segments }
}

const collectInlineSegments = (masked: string): CodeSegment[] =>
  [...masked.matchAll(/(`+)([\s\S]*?)\1/gu)].flatMap((match) => {
    const content = match[2] ?? ''
    if (content === '') {
      return []
    }
    return [
      {
        content,
        kind: 'inline',
        line: countLineBreaks(masked.slice(0, match.index ?? 0)) + 1,
      },
    ]
  })

const extractCodeSegments = (markdown: string): CodeSegment[] => {
  const lines = markdown.split('\n')
  const { fenceLines, segments } = collectFencedSegments(lines)

  // Mask fenced blocks while preserving offsets, then collect inline code
  // spans outside them. Inline code can wrap across lines, so it is parsed as
  // one logical command after replacing line breaks with spaces.
  const masked = lines
    .map((line, index) =>
      fenceLines.has(index) ? ' '.repeat(line.length) : line,
    )
    .join('\n')

  return [...segments, ...collectInlineSegments(masked)]
}

const toLogicalLines = (
  segment: CodeSegment,
): { readonly line: number; readonly text: string }[] => {
  if (segment.kind === 'inline') {
    return [
      {
        line: segment.line,
        text: segment.content.replace(/\r?\n/gu, ' '),
      },
    ]
  }

  const lines = segment.content.split(/\r?\n/u)
  const logicalLines: { line: number; text: string }[] = []
  let index = 0

  while (index < lines.length) {
    let text = lines[index] ?? ''
    let consumed = 1

    while (/\\[ \t]*$/u.test(text) && index + consumed < lines.length) {
      text = `${text.replace(/\\[ \t]*$/u, '')} ${lines[index + consumed] ?? ''}`
      consumed += 1
    }

    logicalLines.push({ line: segment.line + index, text })
    index += consumed
  }

  return logicalLines
}

const extractPackageScriptReferences = (
  markdown: string,
): PackageScriptReference[] =>
  extractCodeSegments(markdown).flatMap((segment) =>
    toLogicalLines(segment).flatMap(({ line, text }) => {
      const commandLine = stripShellComment(text)

      return [...commandLine.matchAll(COMMAND_PATTERN)].flatMap((match) => {
        const packageManager = match[1]
        if (packageManager !== 'bun' && packageManager !== 'npm') {
          return []
        }

        const script = SCRIPT_TOKEN_PATTERN.exec(match[2] ?? '')?.[0]
        if (script === undefined) {
          return []
        }

        return [{ line, packageManager, script }]
      })
    }),
  )

const packageScripts = new Set(
  Object.keys(
    (
      JSON.parse(
        readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
      ) as {
        scripts?: Record<string, string>
      }
    ).scripts ?? {},
  ),
)

const documentationFiles = collectDocumentationFiles()

const findMissingReferences = (
  markdown: string,
  scripts: ReadonlySet<string>,
): PackageScriptReference[] => {
  const references = extractPackageScriptReferences(markdown)
  return references.filter((reference) => !scripts.has(reference.script))
}

const findMissingDocumentationReferences =
  (): MissingPackageScriptReference[] =>
    documentationFiles.flatMap((file) =>
      findMissingReferences(readFileSync(file, 'utf8'), packageScripts).map(
        (reference) => ({
          ...reference,
          file: path.relative(projectRoot, file),
        }),
      ),
    )

describe('documentation package script references', () => {
  it('extracts commands from fenced code blocks and inline code with arguments', () => {
    const markdown = [
      '# Commands',
      '',
      '```bash',
      'bun run quality:check   # quality gate',
      'bun run test:node -- src/foo.test.ts',
      'bun run academy:check .output/chrome-mv3 .output/firefox-mv2',
      '```',
      '',
      '| command | note |',
      '| --- | --- |',
      '| `bun run e2e:release` | release flow |',
      '',
      'Run `bun run release:check[^1]` before publishing.',
      '',
      '[^1]: The footnote must not become part of the script name.',
    ].join('\n')

    expect(extractPackageScriptReferences(markdown)).toEqual([
      { line: 4, packageManager: 'bun', script: 'quality:check' },
      { line: 5, packageManager: 'bun', script: 'test:node' },
      { line: 6, packageManager: 'bun', script: 'academy:check' },
      { line: 11, packageManager: 'bun', script: 'e2e:release' },
      { line: 13, packageManager: 'bun', script: 'release:check' },
    ])
  })

  it('ignores placeholders, prose, commented commands, and non-shell fences', () => {
    const markdown = [
      '```bash',
      '# bun run removed:script',
      'bun run <script>',
      'bun run "$SCRIPT"',
      'bun run --help',
      '```',
      '',
      'Use `bun run` in prose and `bun run/npm run` as a phrase.',
      '',
      '```json',
      '{"command": "bun run not-a-script"}',
      '```',
    ].join('\n')

    expect(extractPackageScriptReferences(markdown)).toEqual([])
  })

  it('handles line continuations and multiline inline commands', () => {
    const markdown = [
      '```bash',
      'bun run \\',
      '  verify:production-network-policy',
      'bun run build && \\',
      '  bun run build:firefox',
      '```',
      '',
      '`bun run build && bun run build:firefox && bun run',
      '  verify:production-network-policy`',
    ].join('\n')

    expect(
      extractPackageScriptReferences(markdown).map(
        (reference) => reference.script,
      ),
    ).toEqual([
      'verify:production-network-policy',
      'build',
      'build:firefox',
      'build',
      'build:firefox',
      'verify:production-network-policy',
    ])
  })

  it('detects missing bun and npm script references', () => {
    const markdown = [
      '```sh',
      'bun run quality',
      'npm run missing:script',
      'bun run quality:check -- --help',
      '```',
    ].join('\n')

    expect(findMissingReferences(markdown, new Set(['quality:check']))).toEqual(
      [
        { line: 2, packageManager: 'bun', script: 'quality' },
        { line: 3, packageManager: 'npm', script: 'missing:script' },
      ],
    )
  })

  it('validates every reference in maintained documentation', () => {
    expect(findMissingDocumentationReferences()).toEqual([])
  })

  it('includes README and docs, but excludes historical plans', () => {
    expect(documentationFiles).toContain(path.join(projectRoot, 'README.md'))
    expect(documentationFiles).toContain(path.join(docsRoot, 'release.md'))
    expect(
      documentationFiles.some((file) =>
        path.relative(projectRoot, file).split(path.sep).includes('plans'),
      ),
    ).toBe(false)
  })

  it('covers the #910 release documentation regression', () => {
    const releaseDoc = readFileSync(path.join(docsRoot, 'release.md'), 'utf8')

    expect(findMissingReferences(releaseDoc, packageScripts)).toEqual([])
    expect(releaseDoc).toContain('bun run quality:check')
    expect(releaseDoc).not.toMatch(/\bbun run quality\b(?!:)/u)
  })
})
