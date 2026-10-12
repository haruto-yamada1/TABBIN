import { createHash } from 'node:crypto'
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export function createSnapshot(root: string): string {
  const snapshot = realpathSync(
    mkdtempSync(path.join(tmpdir(), 'tabbin-eval-input-')),
  )
  try {
    for (const file of ['AGENTS.md', '.apm', 'evals/codex-issues']) {
      cpSync(path.join(root, file), path.join(snapshot, file), {
        recursive: true,
      })
    }
    return snapshot
  } catch (error) {
    rmSync(snapshot, { recursive: true, force: true })
    throw error
  }
}

export function installGuidance(snapshot: string, seed: string): void {
  if (
    realpathSync(snapshot) === realpathSync(seed) ||
    existsSync(path.join(seed, '.git'))
  ) {
    throw new Error('Guidance must be installed into a fresh evaluation seed')
  }
  rmSync(path.join(seed, '.apm'), { recursive: true, force: true })
  rmSync(path.join(seed, '.agents/skills'), { recursive: true, force: true })
  cpSync(path.join(snapshot, '.apm'), path.join(seed, '.apm'), {
    recursive: true,
  })
  cpSync(path.join(snapshot, 'AGENTS.md'), path.join(seed, 'AGENTS.md'))
  cpSync(
    path.join(snapshot, '.apm/skills'),
    path.join(seed, '.agents/skills'),
    { recursive: true },
  )
}
export function fingerprint(root: string): string {
  const hash = createHash('sha256')
  for (const relative of ['AGENTS.md', '.apm', 'evals/codex-issues']) {
    const visit = (file: string) => {
      const stat = lstatSync(file)
      if (stat.isSymbolicLink()) {
        throw new Error('Guidance must not be symlinked')
      }
      if (stat.isDirectory()) {
        for (const name of readdirSync(file).toSorted()) {
          visit(path.join(file, name))
        }
      } else {
        hash.update(path.relative(root, file)).update(readFileSync(file))
      }
    }
    visit(path.join(root, relative))
  }
  return hash.digest('hex')
}

export function implementationFingerprint(directory: string): string {
  const hash = createHash('sha256')
  for (const name of readdirSync(directory)
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
    .toSorted()) {
    hash.update(name).update(readFileSync(path.join(directory, name)))
  }
  return hash.digest('hex')
}

export function installWorkspaceSkills(
  snapshot: string,
  workspace: string,
): void {
  if (
    !existsSync(path.join(workspace, '.git')) ||
    realpathSync(snapshot) === realpathSync(workspace)
  ) {
    throw new Error('Skills must be installed into an isolated Git workspace')
  }
  rmSync(path.join(workspace, '.agents/skills'), {
    recursive: true,
    force: true,
  })
  cpSync(
    path.join(snapshot, '.apm/skills'),
    path.join(workspace, '.agents/skills'),
    { recursive: true },
  )
}
