import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export const REQUIRED_AGENT_ARTIFACTS = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.agents/skills/github-pr-review/SKILL.md',
] as const

export const REQUIRED_AGENT_ARTIFACT_CONTENT = {
  '.agents/skills/github-pr-review/SKILL.md': 'name: github-pr-review',
  'AGENTS.md': '# GitHub Pull Request review の routing',
  'CLAUDE.md': '# GitHub Pull Request review の routing',
  'GEMINI.md': '@./AGENTS.md',
} as const satisfies Record<(typeof REQUIRED_AGENT_ARTIFACTS)[number], string>

const SNAPSHOT_PATHS = [
  ...REQUIRED_AGENT_ARTIFACTS,
  '.agents',
  '.claude',
  '.codex',
  '.cursor',
  '.gemini',
  '.github',
  '.opencode',
  'apm.lock.yaml',
] as const

const TRACKED_SYNC_ARTIFACTS = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'apm.lock.yaml',
] as const

const GENERATED_AGENT_ARTIFACT_PATHS = [
  '.agents/skills',
  '.claude/apm-hooks.json',
  '.claude/commands',
  '.claude/hooks/TABBIN',
  '.claude/rules',
  '.claude/settings.json',
  '.claude/skills',
  '.codex/hooks.json',
  '.codex/hooks/TABBIN',
  '.cursor/commands',
  '.cursor/hooks.json',
  '.cursor/hooks/TABBIN',
  '.cursor/rules',
  '.gemini/commands',
  '.gemini/hooks/TABBIN',
  '.gemini/settings.json',
  '.github/copilot-instructions.md',
  '.github/hooks',
  '.github/instructions',
  '.github/prompts',
  '.github/skills',
  '.opencode/commands',
] as const

const GENERATED_MARKER = '*To regenerate: `apm compile`*'

const FORBIDDEN_ARTIFACT_PATTERNS = [
  'Preview: Would generate',
  'Would generate stub',
  'APM dry-run',
  'apm compile --dry-run',
] as const

const PERSONAL_ABSOLUTE_PATH_PATTERNS = [
  /\/Users\/[A-Za-z0-9_-]+\//,
  /\/home\/[A-Za-z0-9_-]+\//,
] as const

type AgentConfigCommand = {
  args: readonly string[]
  command: string
}

export type AgentConfigCommandRunner = (
  command: string,
  args: readonly string[],
  cwd: string,
) => void

type SyncAgentConfigOptions = {
  checkOnly?: boolean
  projectRoot: string
  runner?: AgentConfigCommandRunner
}

type SyncAgentConfigResult = {
  applied: boolean
  idempotent: true
}

export const defaultCommandRunner: AgentConfigCommandRunner = (
  command,
  args,
  cwd,
): void => {
  execFileSync(command, [...args], { cwd, stdio: 'inherit' })
}

export const buildDeploymentCommands = (
  frozen = true,
): AgentConfigCommand[] => {
  return [
    {
      args: [
        'install',
        ...(frozen ? ['--frozen'] : []),
        '--force',
        '--only',
        'apm',
      ],
      command: 'apm',
    },
    {
      args: ['compile', '--single-agents', '--no-dedup'],
      command: 'apm',
    },
  ]
}

export const validateNoForbiddenContent = (
  relativePath: string,
  content: string,
): void => {
  for (const pattern of FORBIDDEN_ARTIFACT_PATTERNS) {
    if (content.includes(pattern)) {
      throw new Error(
        `Forbidden APM preview/dry-run output detected in ${relativePath}: ${pattern}`,
      )
    }
  }
  for (const pattern of PERSONAL_ABSOLUTE_PATH_PATTERNS) {
    if (pattern.test(content)) {
      throw new Error(
        `Personal absolute path detected in ${relativePath}: ${pattern.source}`,
      )
    }
  }
}

export const stripArtifactContamination = (root: string): void => {
  for (const relativePath of REQUIRED_AGENT_ARTIFACTS) {
    const artifactPath = path.join(root, relativePath)
    if (!existsSync(artifactPath)) {
      continue
    }
    const content = readFileSync(artifactPath, 'utf8')
    const markerIndex = content.lastIndexOf(GENERATED_MARKER)
    if (markerIndex === -1) {
      continue
    }
    const markerEnd = markerIndex + GENERATED_MARKER.length
    if (markerEnd < content.length) {
      const afterMarker = content.slice(markerEnd)
      if (afterMarker.trim().length > 0) {
        writeFileSync(artifactPath, `${content.slice(0, markerEnd)}\n`)
      }
    }
  }
}

export const validateRequiredAgentArtifacts = (root: string): void => {
  for (const relativePath of REQUIRED_AGENT_ARTIFACTS) {
    const artifactPath = path.join(root, relativePath)
    if (!existsSync(artifactPath)) {
      throw new Error(`Required agent artifact is missing: ${relativePath}`)
    }
    if (statSync(artifactPath).size === 0) {
      throw new Error(`Required agent artifact is empty: ${relativePath}`)
    }
    const content = readFileSync(artifactPath, 'utf8')
    const requiredContent = REQUIRED_AGENT_ARTIFACT_CONTENT[relativePath]
    if (!content.includes(requiredContent)) {
      throw new Error(
        `Required agent artifact content is missing: ${relativePath}`,
      )
    }
    validateNoForbiddenContent(relativePath, content)
  }
}

const collectSnapshotFiles = (root: string, relativePath: string): string[] => {
  const absolutePath = path.join(root, relativePath)
  if (!existsSync(absolutePath)) {
    return []
  }
  if (!statSync(absolutePath).isDirectory()) {
    return [relativePath]
  }
  return readdirSync(absolutePath).flatMap((entry) =>
    collectSnapshotFiles(root, path.join(relativePath, entry)),
  )
}

export const createAgentConfigSnapshot = (root: string): string => {
  const files = [
    ...new Set(
      SNAPSHOT_PATHS.flatMap((relativePath) =>
        collectSnapshotFiles(root, relativePath),
      ),
    ),
  ].toSorted()
  const hash = createHash('sha256')
  for (const relativePath of files) {
    hash.update(relativePath)
    hash.update('\0')
    hash.update(readFileSync(path.join(root, relativePath)))
    hash.update('\0')
  }
  return hash.digest('hex')
}

const validateTrackedArtifactSync = (
  projectRoot: string,
  scratchRoot: string,
): void => {
  for (const relativePath of TRACKED_SYNC_ARTIFACTS) {
    const projectPath = path.join(projectRoot, relativePath)
    const scratchPath = path.join(scratchRoot, relativePath)
    if (
      !existsSync(projectPath) ||
      !readFileSync(projectPath).equals(readFileSync(scratchPath))
    ) {
      throw new Error(`APM agent configuration drift detected: ${relativePath}`)
    }
  }
}

const runCommand = (
  projectRoot: string,
  runner: AgentConfigCommandRunner,
  { args, command }: AgentConfigCommand,
): void => {
  runner(command, args, projectRoot)
}

const runDeployment = (
  workingDirectory: string,
  runner: AgentConfigCommandRunner,
  frozen: boolean,
): void => {
  for (const command of buildDeploymentCommands(frozen)) {
    runCommand(workingDirectory, runner, command)
  }
}

const removeGeneratedAgentArtifacts = (projectRoot: string): void => {
  for (const relativePath of GENERATED_AGENT_ARTIFACT_PATHS) {
    rmSync(path.join(projectRoot, relativePath), {
      force: true,
      recursive: true,
    })
  }
}

const formatApmLockfile = (
  projectRoot: string,
  workingDirectory: string,
  runner: AgentConfigCommandRunner,
): void => {
  runCommand(workingDirectory, runner, {
    args: ['apm.lock.yaml'],
    command: path.join(projectRoot, 'node_modules/.bin/oxfmt'),
  })
}

const copyApmProject = (projectRoot: string, scratchRoot: string): void => {
  copyFileSync(
    path.join(projectRoot, 'apm.yml'),
    path.join(scratchRoot, 'apm.yml'),
  )
  copyFileSync(
    path.join(projectRoot, 'apm.lock.yaml'),
    path.join(scratchRoot, 'apm.lock.yaml'),
  )
  copyFileSync(
    path.join(projectRoot, '.oxfmtrc.json'),
    path.join(scratchRoot, '.oxfmtrc.json'),
  )
  cpSync(path.join(projectRoot, '.apm'), path.join(scratchRoot, '.apm'), {
    recursive: true,
  })
  for (const targetDirectory of [
    '.agents',
    '.claude',
    '.codex',
    '.cursor',
    '.gemini',
    '.github',
    '.opencode',
  ]) {
    mkdirSync(path.join(scratchRoot, targetDirectory))
  }
}

export const syncAgentConfig = ({
  checkOnly = false,
  projectRoot,
  runner = defaultCommandRunner,
}: SyncAgentConfigOptions): SyncAgentConfigResult => {
  runCommand(projectRoot, runner, {
    args: ['compile', '--validate'],
    command: 'apm',
  })

  const scratchRoot = mkdtempSync(
    path.join(tmpdir(), 'tabbin-agent-config-sync-'),
  )

  try {
    copyApmProject(projectRoot, scratchRoot)
    runCommand(scratchRoot, runner, {
      args: ['install', '--dry-run', '--frozen', '--only', 'apm'],
      command: 'apm',
    })

    runDeployment(scratchRoot, runner, true)
    stripArtifactContamination(scratchRoot)
    formatApmLockfile(projectRoot, scratchRoot, runner)
    validateRequiredAgentArtifacts(scratchRoot)
    const firstSnapshot = createAgentConfigSnapshot(scratchRoot)

    runDeployment(scratchRoot, runner, true)
    stripArtifactContamination(scratchRoot)
    formatApmLockfile(projectRoot, scratchRoot, runner)
    validateRequiredAgentArtifacts(scratchRoot)
    const secondSnapshot = createAgentConfigSnapshot(scratchRoot)
    if (secondSnapshot !== firstSnapshot) {
      throw new Error('APM agent configuration sync is not idempotent')
    }

    if (checkOnly) {
      validateTrackedArtifactSync(projectRoot, scratchRoot)
    } else {
      removeGeneratedAgentArtifacts(projectRoot)
      runDeployment(projectRoot, runner, true)
      stripArtifactContamination(projectRoot)
      formatApmLockfile(projectRoot, projectRoot, runner)
      validateRequiredAgentArtifacts(projectRoot)
      validateTrackedArtifactSync(projectRoot, scratchRoot)
    }

    return { applied: !checkOnly, idempotent: true }
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true })
  }
}
