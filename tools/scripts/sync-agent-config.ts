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

// Exact structure of the annotation that `apm compile --single-agents` (legacy
// mode) appends after GENERATED_MARKER. stripKnownApmLegacyAnnotation removes
// only a full match of this structure; any extra or differing content is left
// in place so validateGeneratedSurfaceContamination fails fail-closed.
const APM_LEGACY_ANNOTATION_FILE = String.raw`[^\n]+`
const APM_LEGACY_ANNOTATION_BLOCK = `(?:${APM_LEGACY_ANNOTATION_FILE} Preview: Would generate \\d+ files?\\n  ${APM_LEGACY_ANNOTATION_FILE}|${APM_LEGACY_ANNOTATION_FILE} Preview: Would generate stub importing AGENTS\\.md)`
const APM_LEGACY_ANNOTATION_PATTERN = new RegExp(
  `^\\n+---\\n\\n${APM_LEGACY_ANNOTATION_BLOCK}(?:\\n\\n---\\n\\n${APM_LEGACY_ANNOTATION_BLOCK})*\\n*$`,
)

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

const CONTAMINATION_CHECK_EXTENSIONS = new Set([
  '.md',
  '.mdc',
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.sh',
  '.txt',
])

const CONTAMINATION_DEFAULT_MAX_SIZE = 512 * 1024

const CONTAMINATION_EXCLUDED_SEGMENTS = new Set(['node_modules', '.git'])

const GENERATED_SURFACE_ROOTS = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  ...GENERATED_AGENT_ARTIFACT_PATHS,
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
  contaminationAllowlist?: readonly string[]
  projectRoot: string
  repair?: boolean
  runner?: AgentConfigCommandRunner
}

type SyncAgentConfigResult = {
  applied: boolean
  idempotent: true
}

export type AgentConfigCliArgs = {
  checkOnly: boolean
  repair: boolean
}

export const parseAgentConfigCliArgs = (
  argv: readonly string[],
): AgentConfigCliArgs => {
  const repair = argv.includes('--repair')
  const checkOnly = argv.includes('--check')
  if (repair && checkOnly) {
    throw new Error(
      '--repair and --check are mutually exclusive: --repair applies fixes, --check is read-only verification.',
    )
  }
  return { checkOnly, repair }
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

export type ContaminationFinding = {
  line: number
  pattern: string
  reason: string
  relativePath: string
}

export type ContaminationCheckOptions = {
  allowlist?: readonly string[]
  maxFileSize?: number
}

export type RepairReport = {
  line: number
  reason: string
  relativePath: string
  removedBytes: number
}

const isExcludedContaminationPath = (relativePath: string): boolean =>
  relativePath
    .split(path.sep)
    .some((segment) => CONTAMINATION_EXCLUDED_SEGMENTS.has(segment))

export const collectGeneratedSurfaceFiles = (root: string): string[] => {
  const files = new Set<string>()
  for (const relativePath of GENERATED_SURFACE_ROOTS) {
    for (const file of collectSnapshotFiles(root, relativePath)) {
      files.add(file)
    }
  }
  return [...files].toSorted()
}

const isContaminationCheckEligible = (
  relativePath: string,
  size: number,
  maxFileSize: number,
  allow: Set<string>,
): boolean => {
  if (isExcludedContaminationPath(relativePath)) {
    return false
  }
  if (size > maxFileSize) {
    return false
  }
  if (!CONTAMINATION_CHECK_EXTENSIONS.has(path.extname(relativePath))) {
    return false
  }
  return !allow.has(relativePath)
}

const collectFileContaminationFindings = (
  relativePath: string,
  content: string,
): ContaminationFinding[] => {
  const findings: ContaminationFinding[] = []
  const lines = content.split('\n')
  for (const pattern of FORBIDDEN_ARTIFACT_PATTERNS) {
    const lineIndex = lines.findIndex((line) => line.includes(pattern))
    if (lineIndex !== -1) {
      findings.push({
        relativePath,
        line: lineIndex + 1,
        pattern,
        reason: 'preview/dry-run output',
      })
    }
  }
  for (const pattern of PERSONAL_ABSOLUTE_PATH_PATTERNS) {
    const lineIndex = lines.findIndex((line) => pattern.test(line))
    if (lineIndex !== -1) {
      findings.push({
        relativePath,
        line: lineIndex + 1,
        pattern: pattern.source,
        reason: 'personal absolute path',
      })
    }
  }
  const markerIndex = content.lastIndexOf(GENERATED_MARKER)
  if (markerIndex !== -1) {
    const markerEnd = markerIndex + GENERATED_MARKER.length
    const afterMarker = content.slice(markerEnd)
    if (afterMarker.trim().length > 0) {
      const line = content.slice(0, markerEnd).split('\n').length
      findings.push({
        relativePath,
        line,
        pattern: GENERATED_MARKER,
        reason: 'unexpected content after generated marker',
      })
    }
  }
  return findings
}

export const findArtifactContamination = (
  root: string,
  {
    allowlist = [],
    maxFileSize = CONTAMINATION_DEFAULT_MAX_SIZE,
  }: ContaminationCheckOptions = {},
): ContaminationFinding[] => {
  const allow = new Set(allowlist)
  const findings: ContaminationFinding[] = []
  for (const relativePath of collectGeneratedSurfaceFiles(root)) {
    const absolutePath = path.join(root, relativePath)
    let stat: { size: number }
    try {
      stat = statSync(absolutePath)
    } catch {
      continue
    }
    if (
      !isContaminationCheckEligible(relativePath, stat.size, maxFileSize, allow)
    ) {
      continue
    }
    findings.push(
      ...collectFileContaminationFindings(
        relativePath,
        readFileSync(absolutePath, 'utf8'),
      ),
    )
  }
  return findings
}

export const validateGeneratedSurfaceContamination = (
  root: string,
  options?: ContaminationCheckOptions,
): void => {
  const findings = findArtifactContamination(root, options)
  if (findings.length > 0) {
    const details = findings
      .map(
        (finding) =>
          `${finding.relativePath}:${finding.line} [${finding.pattern}] ${finding.reason}`,
      )
      .join('\n')
    throw new Error(`Generated surface contamination detected:\n${details}`)
  }
}

const hasUnsafeContamination = (text: string): boolean => {
  for (const pattern of FORBIDDEN_ARTIFACT_PATTERNS) {
    if (text.includes(pattern)) {
      return true
    }
  }
  for (const pattern of PERSONAL_ABSOLUTE_PATH_PATTERNS) {
    if (pattern.test(text)) {
      return true
    }
  }
  return false
}

// Shared traversal + post-GENERATED_MARKER removal for the generated surface.
// `shouldRemove` decides whether the content after the marker is safe to strip
// for a given contract; `reason` labels the resulting RepairReport. removedBytes
// is consistently the full post-marker byte count so both callers report the
// same metric.
const removePostMarkerContent = (
  root: string,
  reason: string,
  shouldRemove: (afterMarker: string) => boolean,
  onReport?: (report: RepairReport) => void,
): RepairReport[] => {
  const reports: RepairReport[] = []
  for (const relativePath of collectGeneratedSurfaceFiles(root)) {
    if (isExcludedContaminationPath(relativePath)) {
      continue
    }
    const absolutePath = path.join(root, relativePath)
    let stat: { size: number }
    try {
      stat = statSync(absolutePath)
    } catch {
      continue
    }
    if (stat.size > CONTAMINATION_DEFAULT_MAX_SIZE) {
      continue
    }
    if (!CONTAMINATION_CHECK_EXTENSIONS.has(path.extname(relativePath))) {
      continue
    }
    const content = readFileSync(absolutePath, 'utf8')
    const markerIndex = content.lastIndexOf(GENERATED_MARKER)
    if (markerIndex === -1) {
      continue
    }
    const markerEnd = markerIndex + GENERATED_MARKER.length
    const afterMarker = content.slice(markerEnd)
    if (afterMarker.trim().length === 0) {
      continue
    }
    if (!shouldRemove(afterMarker)) {
      continue
    }
    const line = content.slice(0, markerEnd).split('\n').length
    writeFileSync(absolutePath, `${content.slice(0, markerEnd)}\n`)
    const next: RepairReport = {
      relativePath,
      line,
      reason,
      removedBytes: afterMarker.length,
    }
    reports.push(next)
    onReport?.(next)
  }
  return reports
}

// Removes the exact annotation that `apm compile --single-agents` (legacy mode)
// appends after GENERATED_MARKER. This is deterministic normalization of a
// known APM annotation, not contamination repair: any content that is not a
// full match of APM_LEGACY_ANNOTATION_PATTERN is left untouched so that
// validateGeneratedSurfaceContamination fails fail-closed on real drift.
export const stripKnownApmLegacyAnnotation = (
  root: string,
  onStrip?: (report: RepairReport) => void,
): RepairReport[] =>
  removePostMarkerContent(
    root,
    'stripped known APM legacy annotation',
    (afterMarker) => APM_LEGACY_ANNOTATION_PATTERN.test(afterMarker),
    onStrip,
  )

export const repairArtifactContamination = (
  root: string,
  onRepair?: (report: RepairReport) => void,
): RepairReport[] =>
  // Repair only removes benign post-marker drift. Contamination that cannot
  // be safely auto-repaired (preview/dry-run output, personal absolute paths)
  // is left in place so validateGeneratedSurfaceContamination fails fail-closed
  // even in --repair mode. Arbitrary removal is gated behind the explicit
  // --repair flag by the caller.
  removePostMarkerContent(
    root,
    'removed unexpected content after generated marker',
    (afterMarker) => !hasUnsafeContamination(afterMarker),
    onRepair,
  )

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

const logRepair = (report: RepairReport): void => {
  console.log(
    `[apm:repair] ${report.relativePath}:${report.line} ${report.reason} (${report.removedBytes} bytes)`,
  )
}

export const syncAgentConfig = ({
  checkOnly = false,
  contaminationAllowlist,
  projectRoot,
  repair = false,
  runner = defaultCommandRunner,
}: SyncAgentConfigOptions): SyncAgentConfigResult => {
  runCommand(projectRoot, runner, {
    args: ['compile', '--validate'],
    command: 'apm',
  })

  const contaminationOptions: ContaminationCheckOptions = contaminationAllowlist
    ? { allowlist: contaminationAllowlist }
    : {}

  const scratchRoot = mkdtempSync(
    path.join(tmpdir(), 'tabbin-agent-config-sync-'),
  )

  try {
    copyApmProject(projectRoot, scratchRoot)
    runCommand(scratchRoot, runner, {
      args: ['install', '--dry-run', '--frozen', '--only', 'apm'],
      command: 'apm',
    })

    // Normal mode is read-only / fail-closed: the known APM legacy annotation
    // is normalized, then the generated surface is validated without removing
    // arbitrary post-marker drift. Only explicit --repair removes benign drift
    // and re-validates the full generated surface afterward.
    const verifyScratch = (): string => {
      runDeployment(scratchRoot, runner, true)
      stripKnownApmLegacyAnnotation(scratchRoot, repair ? logRepair : undefined)
      if (repair) {
        repairArtifactContamination(scratchRoot, logRepair)
      }
      validateGeneratedSurfaceContamination(scratchRoot, contaminationOptions)
      formatApmLockfile(projectRoot, scratchRoot, runner)
      validateRequiredAgentArtifacts(scratchRoot)
      return createAgentConfigSnapshot(scratchRoot)
    }

    const firstSnapshot = verifyScratch()
    const secondSnapshot = verifyScratch()
    if (secondSnapshot !== firstSnapshot) {
      throw new Error('APM agent configuration sync is not idempotent')
    }

    if (checkOnly) {
      validateTrackedArtifactSync(projectRoot, scratchRoot)
    } else {
      removeGeneratedAgentArtifacts(projectRoot)
      runDeployment(projectRoot, runner, true)
      stripKnownApmLegacyAnnotation(projectRoot, repair ? logRepair : undefined)
      if (repair) {
        repairArtifactContamination(projectRoot, logRepair)
      }
      validateGeneratedSurfaceContamination(projectRoot, contaminationOptions)
      formatApmLockfile(projectRoot, projectRoot, runner)
      validateRequiredAgentArtifacts(projectRoot)
      validateTrackedArtifactSync(projectRoot, scratchRoot)
    }

    return { applied: !checkOnly, idempotent: true }
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true })
  }
}
