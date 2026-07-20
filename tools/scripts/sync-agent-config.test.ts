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
  findArtifactContamination,
  parseAgentConfigCliArgs,
  REQUIRED_AGENT_ARTIFACT_CONTENT,
  REQUIRED_AGENT_ARTIFACTS,
  repairArtifactContamination,
  syncAgentConfig,
  validateGeneratedSurfaceContamination,
  validateNoForbiddenContent,
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

describe('validateNoForbiddenContent', () => {
  it('accepts clean content', () => {
    expect(() =>
      validateNoForbiddenContent('AGENTS.md', '# AGENTS.md\nclean content'),
    ).not.toThrow()
  })

  it('rejects preview/dry-run output', () => {
    expect(() =>
      validateNoForbiddenContent(
        'AGENTS.md',
        '# AGENTS.md\nPreview: Would generate 1 file',
      ),
    ).toThrow('Forbidden APM preview/dry-run output')
  })

  it('rejects Would generate stub', () => {
    expect(() =>
      validateNoForbiddenContent(
        'GEMINI.md',
        '# GEMINI.md\nWould generate stub importing AGENTS.md',
      ),
    ).toThrow('Forbidden APM preview/dry-run output')
  })

  it('rejects personal absolute paths', () => {
    expect(() =>
      validateNoForbiddenContent(
        'AGENTS.md',
        '# AGENTS.md\n@/Users/tarou/.codex/RTK.md',
      ),
    ).toThrow('Personal absolute path detected')
  })

  it('rejects /home paths', () => {
    expect(() =>
      validateNoForbiddenContent(
        'AGENTS.md',
        '# AGENTS.md\n/home/user/.codex/RTK.md',
      ),
    ).toThrow('Personal absolute path detected')
  })
})

describe('repairArtifactContamination', () => {
  it('removes content after the generated marker across generated surfaces', () => {
    const root = createTemporaryDirectory('tabbin-repair-contamination-')
    const artifactPath = path.join(root, 'AGENTS.md')
    mkdirSync(path.dirname(artifactPath), { recursive: true })
    writeFileSync(
      artifactPath,
      '# GitHub Pull Request review\n---\n*This file was generated by APM CLI. Do not edit manually.*\n*To regenerate: `apm compile`*\n\n---\n\nCLAUDE.md Preview: Would generate 1 file\n  CLAUDE.md',
    )

    const reports = repairArtifactContamination(root)

    const result = readFileSync(artifactPath, 'utf8')
    expect(result).not.toContain('Preview: Would generate')
    expect(result).toContain('*To regenerate: `apm compile`*')
    expect(reports).toHaveLength(1)
    expect(reports[0]?.relativePath).toBe('AGENTS.md')
    expect(reports[0]?.reason).toContain('generated marker')
  })

  it('reports each repaired file via the onRepair callback', () => {
    const root = createTemporaryDirectory('tabbin-repair-callback-')
    const artifactPath = path.join(root, 'AGENTS.md')
    mkdirSync(path.dirname(artifactPath), { recursive: true })
    writeFileSync(
      artifactPath,
      '# GitHub Pull Request review\n*To regenerate: `apm compile`*\nmanual drift here',
    )
    const reported: { relativePath: string; removedBytes: number }[] = []

    repairArtifactContamination(root, (report) =>
      reported.push({
        relativePath: report.relativePath,
        removedBytes: report.removedBytes,
      }),
    )

    expect(reported).toHaveLength(1)
    expect(reported[0]?.relativePath).toBe('AGENTS.md')
    expect(reported[0]?.removedBytes).toBeGreaterThan(0)
  })

  it('leaves files without the marker unchanged', () => {
    const root = createTemporaryDirectory('tabbin-repair-no-marker-')
    const artifactPath = path.join(root, 'GEMINI.md')
    mkdirSync(path.dirname(artifactPath), { recursive: true })
    writeFileSync(artifactPath, '# GEMINI.md\n\n@./AGENTS.md\n')

    repairArtifactContamination(root)

    const result = readFileSync(artifactPath, 'utf8')
    expect(result).toBe('# GEMINI.md\n\n@./AGENTS.md\n')
  })

  it('leaves clean files unchanged', () => {
    const root = createTemporaryDirectory('tabbin-repair-clean-')
    const artifactPath = path.join(root, 'AGENTS.md')
    mkdirSync(path.dirname(artifactPath), { recursive: true })
    writeFileSync(
      artifactPath,
      '# GitHub Pull Request review\n*To regenerate: `apm compile`*\n',
    )

    const reports = repairArtifactContamination(root)

    const result = readFileSync(artifactPath, 'utf8')
    expect(result).toContain('*To regenerate: `apm compile`*')
    expect(reports).toHaveLength(0)
  })
})

describe('findArtifactContamination', () => {
  it('detects personal absolute paths anywhere under generated surfaces', () => {
    const root = createTemporaryDirectory('tabbin-contam-personal-')
    const skillPath = path.join(root, '.agents/skills/demo/SKILL.md')
    mkdirSync(path.dirname(skillPath), { recursive: true })
    writeFileSync(
      skillPath,
      '---\nname: demo\n---\n# Demo\nsee /Users/tarou/secret\n',
    )

    const findings = findArtifactContamination(root)

    expect(findings).toHaveLength(1)
    expect(findings[0]?.relativePath).toBe('.agents/skills/demo/SKILL.md')
    expect(findings[0]?.reason).toBe('personal absolute path')
    expect(findings[0]?.line).toBeGreaterThan(0)
  })

  it('detects preview/dry-run output under generated surfaces', () => {
    const root = createTemporaryDirectory('tabbin-contam-preview-')
    const rulePath = path.join(root, '.claude/rules/demo.md')
    mkdirSync(path.dirname(rulePath), { recursive: true })
    writeFileSync(rulePath, '# rule\nPreview: Would generate something\n')

    const findings = findArtifactContamination(root)

    expect(findings).toHaveLength(1)
    expect(findings[0]?.pattern).toBe('Preview: Would generate')
    expect(findings[0]?.relativePath).toBe('.claude/rules/demo.md')
  })

  it('detects unexpected content after the generated marker', () => {
    const root = createTemporaryDirectory('tabbin-contam-marker-')
    const artifactPath = path.join(root, 'AGENTS.md')
    mkdirSync(path.dirname(artifactPath), { recursive: true })
    writeFileSync(
      artifactPath,
      '# GitHub Pull Request review\n*To regenerate: `apm compile`*\nmanual drift',
    )

    const findings = findArtifactContamination(root)

    expect(findings).toHaveLength(1)
    expect(findings[0]?.reason).toBe(
      'unexpected content after generated marker',
    )
    expect(findings[0]?.pattern).toBe('*To regenerate: `apm compile`*')
  })

  it('honors the allowlist for intentional fixture strings', () => {
    const root = createTemporaryDirectory('tabbin-contam-allowlist-')
    const fixturePath = path.join(
      root,
      '.github/instructions/fixture.instructions.md',
    )
    mkdirSync(path.dirname(fixturePath), { recursive: true })
    writeFileSync(fixturePath, '# fixture\nPreview: Would generate\n')

    const findings = findArtifactContamination(root, {
      allowlist: ['.github/instructions/fixture.instructions.md'],
    })

    expect(findings).toHaveLength(0)
  })

  it('skips files larger than maxFileSize', () => {
    const root = createTemporaryDirectory('tabbin-contam-size-')
    const artifactPath = path.join(root, 'AGENTS.md')
    mkdirSync(path.dirname(artifactPath), { recursive: true })
    writeFileSync(
      artifactPath,
      '# GitHub Pull Request review\n/Users/tarou/x\n',
    )
    // pad over maxFileSize
    writeFileSync(
      artifactPath,
      readFileSync(artifactPath, 'utf8') + 'x'.repeat(10),
    )

    const findings = findArtifactContamination(root, { maxFileSize: 5 })

    expect(findings).toHaveLength(0)
  })
})

describe('validateGeneratedSurfaceContamination', () => {
  it('fails fail-closed when content appears after the generated marker', () => {
    const root = createTemporaryDirectory('tabbin-validate-marker-')
    const artifactPath = path.join(root, 'AGENTS.md')
    mkdirSync(path.dirname(artifactPath), { recursive: true })
    writeFileSync(
      artifactPath,
      '# GitHub Pull Request review\n*To regenerate: `apm compile`*\nmanual drift',
    )

    expect(() => validateGeneratedSurfaceContamination(root)).toThrow(
      /Generated surface contamination detected/,
    )
  })

  it('includes relative path, line, and pattern in the error', () => {
    const root = createTemporaryDirectory('tabbin-validate-format-')
    const rulePath = path.join(root, '.claude/rules/demo.md')
    mkdirSync(path.dirname(rulePath), { recursive: true })
    writeFileSync(rulePath, '# rule\n/Users/tarou/secret\n')

    expect(() => validateGeneratedSurfaceContamination(root)).toThrow(
      /\.claude\/rules\/demo\.md:\d+ \[.*\] personal absolute path/,
    )
  })

  it('passes on clean generated surfaces', () => {
    const root = createTemporaryDirectory('tabbin-validate-clean-')
    const artifactPath = path.join(root, 'AGENTS.md')
    mkdirSync(path.dirname(artifactPath), { recursive: true })
    writeFileSync(
      artifactPath,
      '# GitHub Pull Request review\n*To regenerate: `apm compile`*\n',
    )

    expect(() => validateGeneratedSurfaceContamination(root)).not.toThrow()
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

describe('parseAgentConfigCliArgs', () => {
  it('defaults to apply mode without flags', () => {
    expect(parseAgentConfigCliArgs([])).toEqual({
      checkOnly: false,
      repair: false,
    })
  })

  it('enables check-only mode with --check', () => {
    expect(parseAgentConfigCliArgs(['--check'])).toEqual({
      checkOnly: true,
      repair: false,
    })
  })

  it('enables repair mode with --repair', () => {
    expect(parseAgentConfigCliArgs(['--repair'])).toEqual({
      checkOnly: false,
      repair: true,
    })
  })

  it('rejects --repair and --check together', () => {
    expect(() => parseAgentConfigCliArgs(['--repair', '--check'])).toThrow(
      /mutually exclusive/,
    )
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

  const writeContaminatedArtifacts = (root: string): void => {
    writeRequiredArtifacts(root)
    const agentsPath = path.join(root, 'AGENTS.md')
    writeFileSync(
      agentsPath,
      `${readFileSync(agentsPath, 'utf8')}\n/Users/tarou/leak\n`,
    )
  }

  const writePostMarkerDrift = (root: string): void => {
    for (const relativePath of REQUIRED_AGENT_ARTIFACTS) {
      const filePath = path.join(root, relativePath)
      mkdirSync(path.dirname(filePath), { recursive: true })
      const base = `${REQUIRED_AGENT_ARTIFACT_CONTENT[relativePath]}\n`
      if (relativePath === 'AGENTS.md') {
        writeFileSync(
          filePath,
          `${base}---\n*This file was generated by APM CLI. Do not edit manually.*\n*To regenerate: \`apm compile\`*\nmanual drift after marker\n`,
        )
      } else {
        writeFileSync(filePath, `${base}generated:${relativePath}\n`)
      }
    }
  }

  const writeForbiddenBodyArtifacts = (root: string): void => {
    for (const relativePath of REQUIRED_AGENT_ARTIFACTS) {
      const filePath = path.join(root, relativePath)
      mkdirSync(path.dirname(filePath), { recursive: true })
      const base = REQUIRED_AGENT_ARTIFACT_CONTENT[relativePath]
      if (relativePath === 'AGENTS.md') {
        writeFileSync(filePath, `${base}\nPreview: Would generate stub\n`)
      } else {
        writeFileSync(filePath, `${base}\ngenerated:${relativePath}\n`)
      }
    }
  }

  it('fails fail-closed when the raw scratch generation is contaminated', () => {
    const projectRoot = createProject()
    writeRequiredArtifacts(projectRoot)
    const runner: AgentConfigCommandRunner = (command, args, cwd) => {
      if (
        command === 'apm' &&
        (args[0] !== 'compile' || !args.includes('--validate'))
      ) {
        writeContaminatedArtifacts(cwd)
      }
    }

    expect(() =>
      syncAgentConfig({ checkOnly: true, projectRoot, runner }),
    ).toThrow(/Generated surface contamination detected/)
  })

  it('fails apply mode when the project deployment is contaminated', () => {
    const projectRoot = createProject()
    const runner: AgentConfigCommandRunner = (command, args, cwd) => {
      if (
        command === 'apm' &&
        !args.includes('--dry-run') &&
        !args.includes('--validate')
      ) {
        if (cwd === projectRoot) {
          writeContaminatedArtifacts(cwd)
        } else {
          writeRequiredArtifacts(cwd)
        }
      }
    }

    expect(() => syncAgentConfig({ projectRoot, runner })).toThrow(
      /Generated surface contamination detected/,
    )
  })

  it('repair mode strips post-marker drift and completes sync', () => {
    const projectRoot = createProject()
    const runner: AgentConfigCommandRunner = (command, args, cwd) => {
      if (
        command === 'apm' &&
        !args.includes('--dry-run') &&
        !args.includes('--validate')
      ) {
        writePostMarkerDrift(cwd)
      }
    }

    const result = syncAgentConfig({ projectRoot, repair: true, runner })

    expect(result.applied).toBe(true)
    expect(result.idempotent).toBe(true)
    expect(
      readFileSync(path.join(projectRoot, 'AGENTS.md'), 'utf8'),
    ).not.toContain('manual drift after marker')
  })

  it('repair mode still fails on forbidden-pattern contamination in the body', () => {
    const projectRoot = createProject()
    const runner: AgentConfigCommandRunner = (command, args, cwd) => {
      if (
        command === 'apm' &&
        !args.includes('--dry-run') &&
        !args.includes('--validate')
      ) {
        writeForbiddenBodyArtifacts(cwd)
      }
    }

    expect(() =>
      syncAgentConfig({ projectRoot, repair: true, runner }),
    ).toThrow(/Generated surface contamination detected/)
  })
})
