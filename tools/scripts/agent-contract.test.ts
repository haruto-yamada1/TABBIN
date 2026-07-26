import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '..', '..')

const readProjectFile = (relativePath: string): string =>
  readFileSync(path.join(projectRoot, relativePath), 'utf8')

describe('coverage completion contract matches vitest.ci.config.ts', () => {
  it('repository guidelines do not require coverage 100% as a fixed threshold', () => {
    const guidelines = readProjectFile(
      '.apm/instructions/repository-guidelines.instructions.md',
    )
    expect(guidelines).not.toContain('coverage 100%')
    // The threshold source of truth must be vitest.ci.config.ts.
    expect(guidelines).toContain('vitest.ci.config.ts')
  })

  it('test-selection skill does not claim a 100% threshold is configured', () => {
    const skill = readProjectFile('.apm/skills/test-selection/SKILL.md')
    expect(skill).not.toContain('coverage 100% を報告')
    expect(skill).not.toContain('100% threshold が指定')
    expect(skill).not.toMatch(/coverage 100% の扱い/)
  })

  it('instruction wording does not contradict the actual vitest global thresholds', async () => {
    const configModule = await import(
      path.join(projectRoot, 'vitest.ci.config.ts')
    )
    const config = configModule.default as {
      test?: {
        coverage?: {
          thresholds?: {
            statements?: number
            branches?: number
            functions?: number
            lines?: number
          }
        }
      }
    }
    const thresholds = config.test?.coverage?.thresholds
    expect(thresholds).toBeDefined()
    expect(thresholds?.statements).toBeLessThan(100)
    expect(thresholds?.lines).toBeLessThan(100)

    const guidelines = readProjectFile(
      '.apm/instructions/repository-guidelines.instructions.md',
    )
    // No fixed "100%" completion condition may remain.
    expect(guidelines).not.toMatch(/coverage\s*100%/)
  })
})

describe('apm compilation excludes nested worktree sources', () => {
  it('apm.yml compilation.exclude contains .worktrees/** so stale worktree primitives do not leak into generated artifacts', () => {
    const apmYml = readProjectFile('apm.yml')
    const excludeIndex = apmYml.indexOf('exclude:')
    const compilationIndex = apmYml.indexOf('compilation:')
    expect(compilationIndex).toBeGreaterThanOrEqual(0)
    expect(excludeIndex).toBeGreaterThan(compilationIndex)
    const excludeSection = apmYml.slice(excludeIndex)
    expect(excludeSection).toContain('- .worktrees/**')
  })
})
