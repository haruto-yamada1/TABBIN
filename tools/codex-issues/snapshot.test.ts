import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  createSnapshot,
  installGuidance,
  installWorkspaceSkills,
} from './snapshot'

describe('frozen evaluation inputs', () => {
  it('delivers ignored Skills to the actual Git worktree', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'issue-skills-test-'))
    let snapshot: string | undefined
    try {
      for (const name of [
        'current/.apm/skills/active',
        'current/evals/codex-issues',
        'seed',
      ]) {
        mkdirSync(path.join(root, name), { recursive: true })
      }
      writeFileSync(path.join(root, 'current/AGENTS.md'), 'current guidance')
      writeFileSync(
        path.join(root, 'current/.apm/skills/active/SKILL.md'),
        'current skill',
      )
      writeFileSync(path.join(root, 'seed/.gitignore'), '.agents/\n')
      snapshot = createSnapshot(path.join(root, 'current'))
      const seed = path.join(root, 'seed')
      const workspace = path.join(root, 'agent')
      installGuidance(snapshot, seed)
      const git = (args: string[]) =>
        spawnSync('git', args, {
          cwd: seed,
          encoding: 'utf8',
          env: {
            ...process.env,
            GIT_CONFIG_NOSYSTEM: '1',
            GIT_CONFIG_GLOBAL: '/dev/null',
          },
        })
      expect(git(['init', '--quiet']).status).toBe(0)
      expect(git(['add', '.']).status).toBe(0)
      expect(
        git([
          '-c',
          'user.name=Evaluation',
          '-c',
          'user.email=eval@example.invalid',
          'commit',
          '--quiet',
          '-m',
          'Seed',
        ]).status,
      ).toBe(0)
      expect(
        git(['worktree', 'add', '--quiet', '--detach', workspace, 'HEAD'])
          .status,
      ).toBe(0)
      installWorkspaceSkills(snapshot, workspace)
      expect(
        existsSync(path.join(workspace, '.agents/skills/active/SKILL.md')),
      ).toBe(true)
      expect(
        readFileSync(
          path.join(workspace, '.agents/skills/active/SKILL.md'),
          'utf8',
        ),
      ).toBe('current skill')
    } finally {
      if (snapshot) {
        rmSync(snapshot, { recursive: true, force: true })
      }
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('freezes the oracle and removes historical guidance that was deleted', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'issue-input-test-'))
    let snapshot: string | undefined
    try {
      for (const name of [
        'current/.apm/skills/active',
        'current/evals/codex-issues',
        'seed/.apm/skills/obsolete',
        'seed/.agents/skills/obsolete',
      ]) {
        mkdirSync(path.join(root, name), { recursive: true })
      }
      writeFileSync(path.join(root, 'current/AGENTS.md'), 'current guidance')
      writeFileSync(
        path.join(root, 'current/.apm/skills/active/SKILL.md'),
        'current skill',
      )
      writeFileSync(
        path.join(root, 'current/evals/codex-issues/oracle.txt'),
        'fixed oracle',
      )
      snapshot = createSnapshot(path.join(root, 'current'))
      writeFileSync(
        path.join(root, 'current/evals/codex-issues/oracle.txt'),
        'later change',
      )
      installGuidance(snapshot, path.join(root, 'seed'))
      expect(
        readFileSync(
          path.join(snapshot, 'evals/codex-issues/oracle.txt'),
          'utf8',
        ),
      ).toBe('fixed oracle')
      expect(existsSync(path.join(root, 'seed/.apm/skills/obsolete'))).toBe(
        false,
      )
      expect(existsSync(path.join(root, 'seed/.agents/skills/obsolete'))).toBe(
        false,
      )
      expect(
        readFileSync(
          path.join(root, 'seed/.agents/skills/active/SKILL.md'),
          'utf8',
        ),
      ).toBe('current skill')
    } finally {
      if (snapshot) {
        rmSync(snapshot, { recursive: true, force: true })
      }
      rmSync(root, { recursive: true, force: true })
    }
  })
})
import { spawnSync } from 'node:child_process'
