import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  buildDeploymentCommands,
  createAgentConfigSnapshot,
  defaultCommandRunner,
  REQUIRED_AGENT_ARTIFACT_CONTENT,
  REQUIRED_AGENT_ARTIFACTS,
  syncAgentConfig,
  validateRequiredAgentArtifacts,
} from './sync-agent-config.ts'
import type { AgentConfigCommandRunner } from './sync-agent-config.ts'

const temporaryDirectories: string[] = []

const createTemporaryDirectory = (prefix: string): string => {
  const directory = mkdtempSync(path.join(tmpdir(), prefix))
  temporaryDirectories.push(directory)
  return directory
}

const writeRequiredArtifacts = (root: string, value = 'generated'): void => {
  for (const relativePath of REQUIRED_AGENT_ARTIFACTS) {
    const filePath = path.join(root, relativePath)
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(
      filePath,
      `${REQUIRED_AGENT_ARTIFACT_CONTENT[relativePath]}\n${value}:${relativePath}\n`,
    )
  }
}

const createProject = (): string => {
  const projectRoot = createTemporaryDirectory('tabbin-agent-config-project-')
  writeFileSync(path.join(projectRoot, 'apm.yml'), 'name: test\n')
  writeFileSync(
    path.join(projectRoot, 'apm.lock.yaml'),
    'lockfile_version: 1\n',
  )
  writeFileSync(path.join(projectRoot, '.oxfmtrc.json'), '{}\n')
  const skillSource = path.join(
    projectRoot,
    '.apm/skills/github-pr-review/SKILL.md',
  )
  mkdirSync(path.dirname(skillSource), { recursive: true })
  writeFileSync(skillSource, '# GitHub PR Review\n')
  return projectRoot
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('buildDeploymentCommands', () => {
  it('uses apm.yml targets and keeps MCP installation outside agent sync', () => {
    const commands = buildDeploymentCommands()

    expect(commands).toEqual([
      {
        args: ['install', '--frozen', '--force', '--only', 'apm'],
        command: 'apm',
      },
      {
        args: ['compile', '--single-agents', '--no-dedup'],
        command: 'apm',
      },
    ])

    expect(buildDeploymentCommands(false)[0].args).not.toContain('--frozen')
  })
})

describe('defaultCommandRunner', () => {
  it('executes a command in the requested working directory', () => {
    const root = createTemporaryDirectory('tabbin-agent-command-runner-')

    expect(() =>
      defaultCommandRunner(process.execPath, ['--version'], root),
    ).not.toThrow()
  })
})

describe('validateRequiredAgentArtifacts', () => {
  it('accepts non-empty required artifacts', () => {
    const root = createTemporaryDirectory('tabbin-agent-artifacts-')
    writeRequiredArtifacts(root)

    expect(() => validateRequiredAgentArtifacts(root)).not.toThrow()
  })

  it('rejects missing and empty required artifacts', () => {
    const root = createTemporaryDirectory('tabbin-agent-artifacts-invalid-')
    writeRequiredArtifacts(root)

    const missingPath = path.join(root, REQUIRED_AGENT_ARTIFACTS[0])
    unlinkSync(missingPath)
    expect(() => validateRequiredAgentArtifacts(root)).toThrow(
      `Required agent artifact is missing: ${REQUIRED_AGENT_ARTIFACTS[0]}`,
    )

    writeFileSync(missingPath, '')
    expect(() => validateRequiredAgentArtifacts(root)).toThrow(
      `Required agent artifact is empty: ${REQUIRED_AGENT_ARTIFACTS[0]}`,
    )
  })

  it('rejects non-empty artifacts that lost required content', () => {
    const root = createTemporaryDirectory('tabbin-agent-artifacts-incomplete-')
    writeRequiredArtifacts(root)

    const incompletePath = path.join(root, REQUIRED_AGENT_ARTIFACTS[0])
    writeFileSync(incompletePath, '# AGENTS.md\n')

    expect(() => validateRequiredAgentArtifacts(root)).toThrow(
      `Required agent artifact content is missing: ${REQUIRED_AGENT_ARTIFACTS[0]}`,
    )
  })
})

describe('createAgentConfigSnapshot', () => {
  it('is deterministic and changes with generated file content', () => {
    const root = createTemporaryDirectory('tabbin-agent-snapshot-')
    writeRequiredArtifacts(root)

    const first = createAgentConfigSnapshot(root)
    const second = createAgentConfigSnapshot(root)
    expect(second).toBe(first)

    writeFileSync(path.join(root, 'AGENTS.md'), 'changed\n')
    expect(createAgentConfigSnapshot(root)).not.toBe(first)
  })

  it('changes when generated Gemini configuration changes', () => {
    const root = createTemporaryDirectory('tabbin-agent-gemini-snapshot-')
    const geminiDirectory = path.join(root, '.gemini')
    mkdirSync(geminiDirectory)
    writeFileSync(path.join(geminiDirectory, 'settings.json'), '{}\n')

    const first = createAgentConfigSnapshot(root)

    writeFileSync(
      path.join(geminiDirectory, 'settings.json'),
      '{"changed":true}\n',
    )
    expect(createAgentConfigSnapshot(root)).not.toBe(first)
  })

  it('ignores repository source files that are not copied into scratch', () => {
    const root = createTemporaryDirectory('tabbin-agent-source-snapshot-')
    writeFileSync(path.join(root, '.gitignore'), '.gemini/\n')

    const first = createAgentConfigSnapshot(root)

    writeFileSync(path.join(root, '.gitignore'), '.agents/\n')
    expect(createAgentConfigSnapshot(root)).toBe(first)
  })
})

describe('syncAgentConfig', () => {
  it('validates a two-pass scratch sync without changing the project in check mode', () => {
    const projectRoot = createProject()
    writeRequiredArtifacts(projectRoot)
    const agentsBefore = readFileSync(path.join(projectRoot, 'AGENTS.md'))
    const calls: {
      args: readonly string[]
      command: string
      cwd: string
    }[] = []
    let scratchRoot = ''
    let scratchHasFormatterConfig = false
    const runner: AgentConfigCommandRunner = (command, args, cwd) => {
      calls.push({ args, command, cwd })
      if (command.endsWith('/oxfmt') && cwd !== projectRoot) {
        scratchHasFormatterConfig = existsSync(path.join(cwd, '.oxfmtrc.json'))
      }
      if (
        command === 'apm' &&
        (args[0] !== 'compile' || !args.includes('--validate'))
      ) {
        if (cwd !== projectRoot) {
          scratchRoot ||= cwd
        }
        writeRequiredArtifacts(cwd)
      }
    }

    const result = syncAgentConfig({ checkOnly: true, projectRoot, runner })

    expect(calls).toHaveLength(8)
    expect(calls[0]).toEqual({
      args: ['compile', '--validate'],
      command: 'apm',
      cwd: projectRoot,
    })
    expect(calls[1].args).toContain('--dry-run')
    expect(calls[1].args).toContain('--frozen')
    expect(calls[1].args).not.toContain('--target')
    expect(calls[4]).toEqual({
      args: ['apm.lock.yaml'],
      command: path.join(projectRoot, 'node_modules/.bin/oxfmt'),
      cwd: scratchRoot,
    })
    expect(calls[7]).toEqual({
      args: ['apm.lock.yaml'],
      command: path.join(projectRoot, 'node_modules/.bin/oxfmt'),
      cwd: scratchRoot,
    })
    expect(result.applied).toBe(false)
    expect(result.idempotent).toBe(true)
    expect(scratchHasFormatterConfig).toBe(true)
    expect(existsSync(scratchRoot)).toBe(false)
    expect(readFileSync(path.join(projectRoot, 'AGENTS.md'))).toEqual(
      agentsBefore,
    )
  })

  it('fails check mode when tracked generated artifacts drift from scratch output', () => {
    const projectRoot = createProject()
    writeRequiredArtifacts(projectRoot, 'stale-project')
    const runner: AgentConfigCommandRunner = (command, args, cwd) => {
      if (
        command === 'apm' &&
        (args[0] !== 'compile' || !args.includes('--validate'))
      ) {
        writeRequiredArtifacts(cwd)
      }
    }

    expect(() =>
      syncAgentConfig({ checkOnly: true, projectRoot, runner }),
    ).toThrow('APM agent configuration drift detected: AGENTS.md')
  })

  it('applies the verified deployment to the project root', () => {
    const projectRoot = createProject()
    const calls: {
      args: readonly string[]
      command: string
      cwd: string
    }[] = []
    const runner: AgentConfigCommandRunner = (command, args, cwd) => {
      calls.push({ args, command, cwd })
      if (
        command === 'apm' &&
        (args[0] !== 'compile' || !args.includes('--validate'))
      ) {
        writeRequiredArtifacts(cwd)
      }
    }

    const result = syncAgentConfig({ projectRoot, runner })

    expect(calls).toHaveLength(11)
    expect(calls[2].args).toContain('--frozen')
    expect(calls[8].args).toContain('--frozen')
    expect(calls[10]).toEqual({
      args: ['apm.lock.yaml'],
      command: path.join(projectRoot, 'node_modules/.bin/oxfmt'),
      cwd: projectRoot,
    })
    expect(result.applied).toBe(true)
    expect(result.idempotent).toBe(true)
    expect(() => validateRequiredAgentArtifacts(projectRoot)).not.toThrow()
  })

  it('removes stale generated client artifacts before applying the verified deployment', () => {
    const projectRoot = createProject()
    const staleInstruction = path.join(
      projectRoot,
      '.github/instructions/removed.instructions.md',
    )
    const staleClientHooks = [
      '.claude/hooks/TABBIN/scripts/stale.sh',
      '.codex/hooks/TABBIN/scripts/stale.sh',
      '.cursor/hooks/TABBIN/scripts/stale.sh',
      '.gemini/hooks/TABBIN/scripts/stale.sh',
    ].map((relativePath) => path.join(projectRoot, relativePath))
    const preservedWorkflow = path.join(projectRoot, '.github/workflows/ci.yml')
    const preservedIssueTemplate = path.join(
      projectRoot,
      '.github/ISSUE_TEMPLATE/bug_report.md',
    )
    const staleCopilotInstructions = path.join(
      projectRoot,
      '.github/copilot-instructions.md',
    )
    const harnessState = path.join(
      projectRoot,
      '.agents/harness/runtime-state.json',
    )
    mkdirSync(path.dirname(staleInstruction), { recursive: true })
    for (const staleHook of staleClientHooks) {
      mkdirSync(path.dirname(staleHook), { recursive: true })
      writeFileSync(staleHook, '# stale generated hook\n')
    }
    mkdirSync(path.dirname(preservedWorkflow), { recursive: true })
    mkdirSync(path.dirname(preservedIssueTemplate), { recursive: true })
    mkdirSync(path.dirname(harnessState), { recursive: true })
    writeFileSync(staleInstruction, '# Removed source\n')
    writeFileSync(preservedWorkflow, 'name: CI\n')
    writeFileSync(preservedIssueTemplate, '# Bug report\n')
    writeFileSync(staleCopilotInstructions, '# stale generated instructions\n')
    writeFileSync(harnessState, '{"status":"running"}\n')

    let rootDeploymentSawClean = false
    const runner: AgentConfigCommandRunner = (command, args, cwd) => {
      if (
        command === 'apm' &&
        (args[0] !== 'compile' || !args.includes('--validate'))
      ) {
        if (cwd === projectRoot && !args.includes('--dry-run')) {
          rootDeploymentSawClean =
            !existsSync(staleInstruction) &&
            !staleClientHooks.some((file) => existsSync(file)) &&
            !existsSync(staleCopilotInstructions)
        }
        writeRequiredArtifacts(cwd)
      }
    }

    syncAgentConfig({ projectRoot, runner })

    expect(existsSync(staleInstruction)).toBe(false)
    expect(staleClientHooks.some((file) => existsSync(file))).toBe(false)
    expect(existsSync(staleCopilotInstructions)).toBe(false)
    expect(rootDeploymentSawClean).toBe(true)
    expect(readFileSync(preservedWorkflow, 'utf8')).toBe('name: CI\n')
    expect(readFileSync(preservedIssueTemplate, 'utf8')).toBe('# Bug report\n')
    expect(readFileSync(harnessState, 'utf8')).toBe('{"status":"running"}\n')
  })

  it('fails apply mode when repository output diverges from verified scratch output', () => {
    const projectRoot = createProject()
    const runner: AgentConfigCommandRunner = (command, args, cwd) => {
      if (
        command === 'apm' &&
        !args.includes('--dry-run') &&
        !args.includes('--validate')
      ) {
        writeRequiredArtifacts(
          cwd,
          cwd === projectRoot ? 'divergent-project' : 'generated',
        )
      }
    }

    expect(() => syncAgentConfig({ projectRoot, runner })).toThrow(
      'APM agent configuration drift detected: AGENTS.md',
    )
  })

  it('fails when the second scratch deployment changes generated output', () => {
    const projectRoot = createProject()
    let deployment = 0
    const runner: AgentConfigCommandRunner = (command, args, cwd) => {
      if (
        command === 'apm' &&
        !args.includes('--dry-run') &&
        !args.includes('--validate')
      ) {
        deployment += 1
        writeRequiredArtifacts(cwd, `deployment-${deployment}`)
      }
    }

    expect(() =>
      syncAgentConfig({ checkOnly: true, projectRoot, runner }),
    ).toThrow('APM agent configuration sync is not idempotent')
  })
})
