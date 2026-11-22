import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '..', '..')
const packageJson = JSON.parse(
  readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
) as { scripts?: Record<string, string> }
const releaseDoc = readFileSync(
  path.join(projectRoot, 'docs', 'release.md'),
  'utf8',
)

const normalizeCommand = (command: string): string => {
  const trimmed = command.trim()
  const bunRun = /^bun run ([^\s]+)(?:\s|$)/u.exec(trimmed)
  return bunRun?.[1] ?? trimmed
}

const parseScriptChain = (script: string): string[] =>
  script
    .split(' && ')
    .map(normalizeCommand)
    .filter((command) => command !== '')

const sliceSection = (
  markdown: string,
  startMarker: string,
  endMarker: string,
): string => {
  const start = markdown.indexOf(startMarker)
  if (start === -1) {
    throw new Error(`missing start marker: ${startMarker}`)
  }
  const end = markdown.indexOf(endMarker, start + startMarker.length)
  if (end === -1) {
    throw new Error(`missing end marker: ${endMarker}`)
  }
  return markdown.slice(start, end)
}

const extractNumberedCommands = (
  markdown: string,
  startMarker: string,
  endMarker: string,
): string[] =>
  sliceSection(markdown, startMarker, endMarker)
    .split('\n')
    .flatMap((line) => {
      const numbered = /^\d+\.\s+(.*)$/u.exec(line)
      if (!numbered) {
        return []
      }
      return [...(numbered[1] ?? '').matchAll(/`([^`]+)`/gu)]
        .map((match) => match[1] ?? '')
        .filter(
          (command) =>
            command === 'git diff --exit-code' ||
            command.startsWith('bun run '),
        )
        .map(normalizeCommand)
    })

const extractTableCommands = (
  markdown: string,
  startMarker: string,
  endMarker: string,
): string[] =>
  sliceSection(markdown, startMarker, endMarker)
    .split('\n')
    .flatMap((line) => {
      const firstColumn = /^\|\s*`([^`]+)`\s*\|/u.exec(line)
      return firstColumn?.[1] ? [normalizeCommand(firstColumn[1])] : []
    })

describe('release documentation', () => {
  const scripts = packageJson.scripts ?? {}

  it('documents the release:check chain in package.json order', () => {
    expect(
      extractNumberedCommands(
        releaseDoc,
        'このコマンドは以下の流れで実行されます：',
        '### リリース直前の依存脆弱性監査',
      ),
    ).toEqual(parseScriptChain(scripts['release:check'] ?? ''))
  })

  it('documents the release:zip chain in package.json order', () => {
    expect(
      extractNumberedCommands(
        releaseDoc,
        '## ZIP 生成',
        '## Provenance / SBOM',
      ),
    ).toEqual(parseScriptChain(scripts['release:zip'] ?? ''))
  })

  it('documents the release:e2e chain in package.json order', () => {
    expect(
      extractTableCommands(
        releaseDoc,
        '### 配布前の E2E',
        'Chrome は `playwright.release.config.ts`',
      ),
    ).toEqual(parseScriptChain(scripts['release:e2e'] ?? ''))
  })

  it('detects a stale script name in a documented chain', () => {
    const staleDoc = [
      'このコマンドは以下の流れで実行されます：',
      '',
      '1. `bun run security:audit` — 監査',
      '2. `bun run quality` — 品質',
      '',
      '### リリース直前の依存脆弱性監査',
    ].join('\n')

    expect(
      extractNumberedCommands(
        staleDoc,
        'このコマンドは以下の流れで実行されます：',
        '### リリース直前の依存脆弱性監査',
      ),
    ).not.toEqual(
      parseScriptChain('bun run security:audit && bun run quality:check'),
    )
  })
})
