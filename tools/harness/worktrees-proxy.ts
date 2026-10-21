import type { spawn } from 'node:child_process'
import { setTimeout } from 'node:timers/promises'

import { z } from 'zod'

const healthSchema = z
  .object({
    service: z.literal('headroom-proxy'),
    ready: z.boolean(),
    config: z
      .object({ pid: z.number().int(), mode: z.literal('cache') })
      .loose(),
  })
  .loose()

export function signalWorktreeProcess(
  child: ReturnType<typeof spawn> | undefined,
  signal: NodeJS.Signals,
): void {
  if (child?.pid === undefined) {
    return
  }
  if (process.platform === 'win32') {
    child.kill(signal)
    return
  }
  try {
    process.kill(-child.pid, signal)
  } catch (error) {
    if (
      !(error instanceof Error && 'code' in error && error.code === 'ESRCH')
    ) {
      throw error
    }
  }
}

export async function waitForOwnedProxy(
  child: ReturnType<typeof spawn>,
  port: number,
  failed: () => boolean,
  deadline = Date.now() + 30000,
): Promise<void> {
  if (failed() || child.exitCode !== null || child.signalCode !== null) {
    throw new Error('Dedicated Headroom proxy did not start')
  }
  if (Date.now() >= deadline) {
    throw new Error('Dedicated Headroom proxy startup timed out')
  }
  let health: unknown
  try {
    const response = await fetch(
      `http://127.0.0.1:${port}/health?include_config=true`,
      {
        redirect: 'error',
        signal: AbortSignal.timeout(1000),
      },
    )
    if (response.ok) {
      health = await response.json()
    }
  } catch {
    /* The owned process may still be starting. */
  }
  if (health !== undefined) {
    const parsed = healthSchema.safeParse(health)
    if (!parsed.success || parsed.data.config.pid !== child.pid) {
      throw new Error(
        'Port belongs to another proxy or incompatible Headroom; no reuse allowed',
      )
    }
    if (parsed.data.ready) {
      return
    }
  }
  await setTimeout(100)
  return waitForOwnedProxy(child, port, failed, deadline)
}

export async function stopOwnedProxy(
  child: ReturnType<typeof spawn> | undefined,
): Promise<void> {
  if (
    child?.exitCode !== null ||
    child.signalCode !== null ||
    child.pid === undefined
  ) {
    return
  }
  const closed = new Promise<void>((resolve) => {
    child.once('close', () => {
      resolve()
    })
  })
  signalWorktreeProcess(child, 'SIGTERM')
  const grace = await Promise.race([
    closed.then(() => true),
    setTimeout(3000, false, { ref: false }),
  ])
  if (!grace) {
    signalWorktreeProcess(child, 'SIGKILL')
    await closed
  }
}
