import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { env } from 'node:process'

import { afterEach, describe, expect, it } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '..', '..')
const scriptPath = path.join(
  projectRoot,
  '.apm/hooks/scripts/format-check-on-edit.sh',
)
const ignoredSkillPath = '.apm/skills/example/SKILL.md'
const formattedPath = 'src/formatted.ts'
const unformattedPath = 'src/unformatted.ts'
const temporaryDirectories: string[] = []

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

const createFixture = () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'format-check-on-edit-'))
  temporaryDirectories.push(directory)
  mkdirSync(path.join(directory, '.apm/skills/example'), { recursive: true })
  mkdirSync(path.join(directory, 'src'))
  symlinkSync(
    path.join(projectRoot, 'node_modules'),
    path.join(directory, 'node_modules'),
    'dir',
  )
  copyFileSync(
    path.join(projectRoot, '.oxfmtrc.json'),
    path.join(directory, '.oxfmtrc.json'),
  )
  writeFileSync(path.join(directory, ignoredSkillPath), '# Skill\n\n-   item\n')
  writeFileSync(
    path.join(directory, formattedPath),
    'export const answer = { value: 42 }\n',
  )
  writeFileSync(
    path.join(directory, unformattedPath),
    'export const answer={value:42};\n',
  )
  return directory
}

const runHook = (directory: string, payload: unknown) => {
  const result = spawnSync('sh', [scriptPath], {
    cwd: directory,
    env: { ...env, CLAUDE_PROJECT_DIR: directory },
    input: JSON.stringify(payload),
    encoding: 'utf8',
    timeout: 30_000,
  })
  expect(result.error).toBeUndefined()
  return result
}

describe('format-check-on-edit hook with the installed formatter', () => {
  it('accepts an edited skill excluded by the formatter configuration', () => {
    const result = runHook(createFixture(), {
      tool_input: { file_path: ignoredSkillPath },
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('accepts a formatted file included in formatter checks', () => {
    const result = runHook(createFixture(), {
      tool_input: { file_path: formattedPath },
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('rejects an unformatted file included in formatter checks', () => {
    const result = runHook(createFixture(), {
      tool_input: { file_path: unformattedPath },
    })

    expect(result.status).toBe(2)
    expect(result.stderr).toContain(unformattedPath)
  })

  it('accepts a patch containing ignored and formatted files', () => {
    const result = runHook(createFixture(), {
      tool_input: {
        patch: [
          '*** Begin Patch',
          `*** Update File: ${ignoredSkillPath}`,
          `*** Update File: ${formattedPath}`,
          '*** End Patch',
        ].join('\n'),
      },
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toBe('')
  })

  it('reports only the unformatted file from a mixed edit payload', () => {
    const result = runHook(createFixture(), {
      tool_input: {
        edits: [ignoredSkillPath, formattedPath, unformattedPath].map(
          (filePath) => ({ file_path: filePath }),
        ),
      },
    })

    expect(result.status).toBe(2)
    expect(result.stderr).toContain(unformattedPath)
    expect(result.stderr).not.toContain(ignoredSkillPath)
    expect(result.stderr).not.toContain(formattedPath)
  })

  it('rejects a formatter execution failure for an included file', () => {
    const directory = createFixture()
    writeFileSync(path.join(directory, '.oxfmtrc.json'), '{')

    const result = runHook(directory, {
      tool_input: { file_path: formattedPath },
    })

    expect(result.status).toBe(2)
    expect(result.stderr).toContain(formattedPath)
  })
})
