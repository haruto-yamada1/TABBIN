import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const projectRoot = path.resolve(import.meta.dirname, '..', '..')
const skillsRoot = path.join(projectRoot, '.apm/skills')
const promptsRoot = path.join(projectRoot, '.apm/prompts')

const SKILL_FILE_EXTENSIONS = /\.(md|yaml|yml|sh|toml|json|ts|js)$/

const walkTextFiles = function* walkTextFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walkTextFiles(absolute)
    } else if (SKILL_FILE_EXTENSIONS.test(entry.name)) {
      yield absolute
    }
  }
}

const skillNames = new Set(
  readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name),
)

const packageScripts = new Set(
  Object.keys(
    (JSON.parse(readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))
      .scripts ?? {}) as Record<string, unknown>,
  ),
)

const skillFiles = [...walkTextFiles(skillsRoot)]

const extractSkillReferences = (content: string): string[] => {
  // `$<name>` with at least one hyphen is a skill reference (shell variables
  // cannot contain hyphens, so this avoids false positives).
  const matches = content.matchAll(/\$([a-z][a-z0-9]*(?:-[a-z0-9]+)+)/g)
  return [...matches].map((match) => match[1])
}

const extractBunRunScripts = (content: string): string[] => {
  const matches = content.matchAll(/bun run ([a-z0-9][a-z0-9:._-]*)/g)
  return [...matches].map((match) => match[1])
}

const extractPromptReferences = (content: string): string[] => {
  const matches = content.matchAll(/\.apm\/prompts\/([a-z0-9-]+\.prompt\.md)/g)
  return [...matches].map((match) => match[1])
}

describe('skill reference integrity', () => {
  it('every $<skill-name> reference resolves to an existing skill', () => {
    const missing: { file: string; reference: string }[] = []
    for (const file of skillFiles) {
      const content = readFileSync(file, 'utf8')
      for (const reference of extractSkillReferences(content)) {
        if (!skillNames.has(reference)) {
          missing.push({ file: path.relative(skillsRoot, file), reference })
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('every `bun run <script>` reference in skills exists in package.json', () => {
    const missing: { file: string; script: string }[] = []
    for (const file of skillFiles) {
      const content = readFileSync(file, 'utf8')
      for (const script of extractBunRunScripts(content)) {
        if (!packageScripts.has(script)) {
          missing.push({ file: path.relative(skillsRoot, file), script })
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('every referenced .apm/prompts/<x>.prompt.md file exists', () => {
    const missing: { file: string; prompt: string }[] = []
    for (const file of skillFiles) {
      const content = readFileSync(file, 'utf8')
      for (const prompt of extractPromptReferences(content)) {
        if (!existsSync(path.join(promptsRoot, prompt))) {
          missing.push({ file: path.relative(skillsRoot, file), prompt })
        }
      }
    }
    expect(missing).toEqual([])
  })

  it('no skill references the removed superpowers namespace', () => {
    const offenders: string[] = []
    for (const file of skillFiles) {
      const content = readFileSync(file, 'utf8')
      if (/superpowers[:/]/.test(content)) {
        offenders.push(path.relative(skillsRoot, file))
      }
    }
    expect(offenders).toEqual([])
  })

  it('every skill SKILL.md frontmatter name matches its directory', () => {
    const mismatches: { dir: string; frontmatterName: string }[] = []
    for (const name of skillNames) {
      const skillPath = path.join(skillsRoot, name, 'SKILL.md')
      if (!existsSync(skillPath)) {
        continue
      }
      const content = readFileSync(skillPath, 'utf8')
      const match = /^---\s*\n[\s\S]*?^name:\s*(\S+)\s*$/m.exec(content)
      const frontmatterName = match?.[1]
      if (frontmatterName !== name) {
        mismatches.push({ dir: name, frontmatterName: String(frontmatterName) })
      }
    }
    expect(mismatches).toEqual([])
  })

  it('every skill directory contains a non-empty SKILL.md', () => {
    const missing: string[] = []
    for (const name of skillNames) {
      const skillPath = path.join(skillsRoot, name, 'SKILL.md')
      if (!existsSync(skillPath) || statSync(skillPath).size === 0) {
        missing.push(name)
      }
    }
    expect(missing).toEqual([])
  })
})
