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
  'AGENTS.md': '# GitHub Pull Request review の処理',
  'CLAUDE.md': '# GitHub Pull Request review の処理',
  'GEMINI.md': '@./AGENTS.md',
} as const satisfies Record<(typeof REQUIRED_AGENT_ARTIFACTS)[number], string>

const SNAPSHOT_PATHS = [
  ...REQUIRED_AGENT_ARTIFACTS,
  '.agents',
  '.claude',
  '.codex',
  '.cursor',
  '.github',
  '.opencode',
  '.gitignore',
  'apm.lock.yaml',
] as const

const TRACKED_SYNC_ARTIFACTS = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'apm.lock.yaml',
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

export const validateRequiredAgentArtifacts = (root: string): void => {
  for (const relativePath of REQUIRED_AGENT_ARTIFACTS) {
    const artifactPath = path.join(root, relativePath)
    if (!existsSync(artifactPath)) {
      throw new Error(`Required agent artifact is missing: ${relativePath}`)
    }
    if (statSync(artifactPath).size === 0) {
      throw new Error(`Required agent artifact is empty: ${relativePath}`)
    }
    const requiredContent = REQUIRED_AGENT_ARTIFACT_CONTENT[relativePath]
    if (!readFileSync(artifactPath, 'utf8').includes(requiredContent)) {
      throw new Error(
        `Required agent artifact content is missing: ${relativePath}`,
      )
    }
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
    formatApmLockfile(projectRoot, scratchRoot, runner)
    validateRequiredAgentArtifacts(scratchRoot)
    const firstSnapshot = createAgentConfigSnapshot(scratchRoot)

    runDeployment(scratchRoot, runner, true)
    formatApmLockfile(projectRoot, scratchRoot, runner)
    validateRequiredAgentArtifacts(scratchRoot)
    const secondSnapshot = createAgentConfigSnapshot(scratchRoot)
    if (secondSnapshot !== firstSnapshot) {
      throw new Error('APM agent configuration sync is not idempotent')
    }

    if (checkOnly) {
      validateTrackedArtifactSync(projectRoot, scratchRoot)
    } else {
      runDeployment(projectRoot, runner, true)
      formatApmLockfile(projectRoot, projectRoot, runner)
      validateRequiredAgentArtifacts(projectRoot)
      validateTrackedArtifactSync(projectRoot, scratchRoot)
    }

    return { applied: !checkOnly, idempotent: true }
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true })
  }
}
