import { existsSync, lstatSync, mkdirSync } from 'node:fs'

import { z } from 'zod'

export const worktreeRecordSchema = z.strictObject({
  issue: z.number().int().positive(),
  slug: z
    .string()
    .regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/)
    .max(64),
  branch: z.string(),
  worktree: z.string(),
  slot: z.number().int().min(0).max(99),
  runId: z.string(),
  setupComplete: z.boolean(),
  phase: z.enum([
    'ready',
    'running',
    'paused',
    'failed',
    'finished',
    'removed',
  ]),
  pr: z.string().optional(),
  ownerPid: z.number().int().positive().optional(),
  childPid: z.number().int().positive().optional(),
  proxyPid: z.number().int().positive().optional(),
})

export type WorktreeRecord = z.infer<typeof worktreeRecordSchema>

export function privateWorktreeDirectory(directory: string): void {
  if (existsSync(directory)) {
    const stat = lstatSync(directory)
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      stat.uid !== process.getuid?.() ||
      (stat.mode & 0o777) !== 0o700
    ) {
      throw new Error(
        'runtime/registry directory must be private, owned and non-symlinked',
      )
    }
  } else {
    mkdirSync(directory, { mode: 0o700 })
  }
}
