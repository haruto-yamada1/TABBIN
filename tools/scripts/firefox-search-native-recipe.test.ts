import { readFileSync } from 'node:fs'
import path from 'node:path'
import { runInNewContext } from 'node:vm'

import { describe, expect, it, vi } from 'vitest'

const recipe = readFileSync(
  path.resolve(
    import.meta.dirname,
    '../../docs/testing/native-firefox-search.ts.txt',
  ),
  'utf8',
)
const cleanup = /\} finally \{([\s\S]*)\}\s*$/u.exec(recipe)?.[1]
if (cleanup === undefined) {
  throw new Error('Native Firefox recipe must have a final cleanup block')
}

const runCleanup = (
  deleteSession: () => Promise<void>,
  session: object | undefined,
) => {
  const driver = { kill: vi.fn() }
  const rm = vi.fn(async () => {})
  // Execute the actual recipe cleanup with fault-injected boundary operations.
  const completion: unknown = runInNewContext(`(async () => {${cleanup}})()`, {
    deleteSession,
    driver,
    rm,
    session,
    root: '/synthetic-profile',
  })
  return { completion, driver, rm }
}

describe('native Firefox search recipe cleanup', () => {
  it('stops the driver and removes its profile even when session deletion rejects', async () => {
    const failure = new Error('WebDriver deletion failed')
    const deleteSession = vi.fn(async () => {
      throw failure
    })
    const { completion, driver, rm } = runCleanup(deleteSession, {})

    await expect(completion).rejects.toBe(failure)
    expect(driver.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM')
    expect(rm).toHaveBeenCalledExactlyOnceWith('/synthetic-profile', {
      recursive: true,
      force: true,
    })
  })

  it('cleans up after successful deletion', async () => {
    const deleteSession = vi.fn(async () => {})
    const { completion, driver, rm } = runCleanup(deleteSession, {})

    await expect(completion).resolves.toBeUndefined()
    expect(deleteSession).toHaveBeenCalledOnce()
    expect(driver.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM')
    expect(rm).toHaveBeenCalledExactlyOnceWith('/synthetic-profile', {
      recursive: true,
      force: true,
    })
  })

  it('cleans up when no session was established', async () => {
    const deleteSession = vi.fn(async () => {})
    const { completion, driver, rm } = runCleanup(deleteSession, undefined)

    await expect(completion).resolves.toBeUndefined()
    expect(deleteSession).not.toHaveBeenCalled()
    expect(driver.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM')
    expect(rm).toHaveBeenCalledExactlyOnceWith('/synthetic-profile', {
      recursive: true,
      force: true,
    })
  })
})
