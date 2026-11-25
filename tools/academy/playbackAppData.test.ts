import * as filesystem from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:fs/promises', async (original) => {
  const actual = await original<typeof filesystem>()
  return { ...actual, rm: vi.fn(actual.rm) }
})

import { createPlaybackAppData } from './playbackAppData'

const actualFilesystem =
  await vi.importActual<typeof filesystem>('node:fs/promises')

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  vi.mocked(filesystem.rm).mockReset().mockImplementation(actualFilesystem.rm)
  await Promise.all(
    roots
      .splice(0)
      .map(async (root) =>
        filesystem.rm(root, { recursive: true, force: true }),
      ),
  )
})
const createRoot = async () => {
  const root = await filesystem.mkdtemp(
    path.join(os.tmpdir(), 'academy-playback-data-'),
  )
  roots.push(root)
  return root
}

describe('playback app-data ownership', () => {
  it('creates no app-data directory for Chromium', async () => {
    const root = await createRoot()
    const appData = await createPlaybackAppData('chromium', root)
    expect(appData === undefined).toBe(true)
    expect(await filesystem.readdir(root)).toEqual([])
  })

  it('removes only its owned Firefox directory, including files created by the browser', async () => {
    const root = await createRoot()
    await filesystem.writeFile(path.join(root, 'unrelated.txt'), 'keep')
    const appData = await createPlaybackAppData('firefox', root)
    if (!appData) {
      throw new Error('Firefox app-data missing')
    }
    const owned = (await filesystem.readdir(root)).find((name) =>
      name.startsWith('firefox-app-data-'),
    )
    if (!owned) {
      throw new Error('Firefox directory missing')
    }
    await filesystem.writeFile(
      path.join(root, owned, 'browser-cache'),
      'test-only',
    )
    const expectedHome =
      process.platform === 'darwin'
        ? path.join(root, owned)
        : process.env.CFFIXED_USER_HOME
    expect(appData.environment.CFFIXED_USER_HOME).toBe(expectedHome)
    await appData.cleanup()
    expect(await filesystem.readdir(root)).toEqual(['unrelated.txt'])
    expect(
      await filesystem.readFile(path.join(root, 'unrelated.txt'), 'utf8'),
    ).toBe('keep')
  })

  it('warns about protected directory cleanup without replacing a playback failure', async () => {
    const root = await createRoot()
    const appData = await createPlaybackAppData('firefox', root)
    if (!appData) {
      throw new Error('Firefox app-data missing')
    }
    const rejectedCleanup = new Error('EACCES: protected Downloads directory')
    vi.mocked(filesystem.rm).mockRejectedValueOnce(rejectedCleanup)
    const warning = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined)
    const playbackFailure = new Error('video decode failed')
    await expect(
      (async () => {
        try {
          throw playbackFailure
        } finally {
          await appData.cleanup()
        }
      })(),
    ).rejects.toBe(playbackFailure)
    expect(warning).toHaveBeenCalledOnce()
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('Firefox app-data cleanup failed'),
      rejectedCleanup,
    )
  })
})
