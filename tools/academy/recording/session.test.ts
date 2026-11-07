import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { BrowserContext, Page, Worker } from '@playwright/test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  RecordingSession,
  recordingLaunchOptions,
  requireRecordingStage,
} from './session'

describe('Academy recording launch boundary', () => {
  it.each(['chrome', 'chromium'] as const)(
    'records real store installation in %s without sideloading',
    (browser) => {
      const options = recordingLaunchOptions('chrome-web-store', browser)
      expect(options.headless).toBe(false)
      expect(options.channel).toBe(browser)
      expect(options.ignoreDefaultArgs).toContain('--disable-extensions')
      expect(options.args ?? []).toEqual([])
    },
  )

  it('labels sideloaded Chromium as development and does not allow branded Chrome', () => {
    const options = recordingLaunchOptions('unpacked-development', 'chromium')
    expect(options.headless).toBe(false)
    expect(options.args).toEqual(
      expect.arrayContaining([
        expect.stringContaining('--load-extension='),
        expect.stringContaining('--disable-extensions-except='),
      ]),
    )
    expect(() =>
      recordingLaunchOptions('unpacked-development', 'chrome'),
    ).toThrow('requires chromium')
  })
})

describe('Academy recording stage boundary', () => {
  it('does not verify or finish a scene that was never prepared', () => {
    expect(() => requireRecordingStage('installed', 'verify')).toThrow(
      'Cannot run verify from installed.',
    )
    expect(() => requireRecordingStage('prepared', 'finish')).toThrow(
      'Cannot run finish from prepared.',
    )
    expect(() => requireRecordingStage('awaiting-install', 'finish')).toThrow(
      'Cannot run finish from awaiting-install.',
    )
  })

  it('allows observing a retry after a failed verification and requires verified state for finish', () => {
    expect(() => requireRecordingStage('prepared', 'verify')).not.toThrow()
    expect(() => requireRecordingStage('verified', 'finish')).not.toThrow()
    expect(() => requireRecordingStage('installed', 'abort')).not.toThrow()
  })
})

const lifecycleRoots: string[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  await Promise.all(
    lifecycleRoots
      .splice(0)
      .map(async (root) => rm(root, { recursive: true, force: true })),
  )
})

const storeId = 'dljblklbpmoocinnlcejeokopmfoldaj'

const createLifecycle = async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'tabbin-recording-lifecycle-'),
  )
  lifecycleRoots.push(root)
  const runDir = path.join(root, 'run')
  const profileDir = path.join(root, 'profile')
  await Promise.all([mkdir(runDir), mkdir(profileDir)])
  await writeFile(path.join(root, 'retained.txt'), 'outside owned profile')
  const state = {
    metadata: {
      id: storeId,
      name: 'TABBIN',
      version: '2.0.19',
      manifest_version: 3,
    },
    installType: 'normal',
    storedSettings: {
      clickBehavior: 'saveWindowTabs',
      excludePinnedTabs: true,
      excludePatterns: ['chrome://', 'chrome-extension://'],
    },
    pinned: true,
    persistence: {
      collectionCategories: [],
      collections: [],
      collectionGroups: [],
      collectionMemberships: [],
      urls: [],
    } as Record<string, unknown[]>,
  }
  const storageGet = vi.fn(async (key: string) =>
    key === 'changelogShown'
      ? { changelogShown: true }
      : { userSettings: state.storedSettings },
  )
  const managementGetSelf = vi.fn(async () => ({
    installType: state.installType,
  }))
  vi.stubGlobal('chrome', {
    runtime: {
      getManifest: () => state.metadata,
      get id() {
        return state.metadata.id
      },
    },
    management: { getSelf: managementGetSelf },
    storage: { local: { get: storageGet } },
    action: { getUserSettings: async () => ({ isOnToolbar: state.pinned }) },
  })
  vi.stubGlobal('indexedDB', {
    open: () => ({
      result: {
        close: vi.fn(),
        transaction: () => ({
          objectStore: (name: string) => ({
            getAll: () => ({ result: state.persistence[name] ?? [] }),
            get: () => ({ result: { value: 0 } }),
          }),
          addEventListener: (event: string, callback: () => void) => {
            if (event === 'complete') {
              queueMicrotask(callback)
            }
          },
        }),
      },
      addEventListener: (event: string, callback: () => void) => {
        if (event === 'success') {
          queueMicrotask(callback)
        }
      },
    }),
  })
  const evaluate = vi.fn<Worker['evaluate']>()
  evaluate.mockImplementation(async (callback, arg) => {
    if (typeof callback !== 'function') {
      throw new TypeError(
        'Only callback evaluation is supported in this test browser boundary.',
      )
    }
    return callback(arg)
  })
  const workerFactory = vi.fn<() => Worker>()
  vi.mocked(workerFactory, { partial: true }).mockReturnValue({
    url: () => `chrome-extension://${storeId}/background.js`,
    evaluate,
  })
  const worker = workerFactory()
  const screenshot = vi
    .fn<Page['screenshot']>()
    .mockImplementation(async (options) => {
      if (options?.path) {
        await writeFile(options.path, 'unit-test-screenshot')
      }
      return Buffer.from('unit-test-screenshot')
    })
  const pageFactory = vi.fn<() => Page>()
  vi.mocked(pageFactory, { partial: true }).mockReturnValue({ screenshot })
  const page = pageFactory()
  const contextFactory = vi.fn<() => BrowserContext>()
  const close = vi.fn<BrowserContext['close']>().mockResolvedValue(undefined)
  const pages = vi.fn<BrowserContext['pages']>().mockReturnValue([page])
  const serviceWorkers = vi
    .fn<BrowserContext['serviceWorkers']>()
    .mockReturnValue([worker])
  const waitForEvent = vi.fn(async () => {
    throw new Error('No extension service worker is available.')
  })
  const newPage = vi.fn<BrowserContext['newPage']>()
  const route = vi.fn<BrowserContext['route']>()
  vi.mocked(contextFactory, { partial: true }).mockReturnValue({
    browser: () => null,
    close,
    pages,
    serviceWorkers,
    waitForEvent,
    newPage,
    route,
  })
  vi.spyOn(console, 'log').mockImplementation(() => undefined)
  const context = contextFactory()
  const session = new RecordingSession({
    runDir,
    profileDir,
    source: 'chrome-web-store',
    browser: 'chromium',
    context,
  })
  const readResult = async () =>
    JSON.parse(
      await readFile(path.join(runDir, 'result.json'), 'utf8'),
    ) as unknown
  const readOperations = async () =>
    (await readFile(path.join(runDir, 'operations.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line): unknown => JSON.parse(line))
  return {
    root,
    runDir,
    profileDir,
    state,
    storageGet,
    managementGetSelf,
    evaluate,
    worker,
    context,
    session,
    close,
    pages,
    serviceWorkers,
    waitForEvent,
    screenshot,
    newPage,
    route,
    readResult,
    readOperations,
  }
}

describe('RecordingSession observable lifecycle', () => {
  it('records a refused out-of-order command and failure screenshot without deleting the scene', async () => {
    const scene = await createLifecycle()
    await expect(scene.session.command('prepare')).rejects.toThrow(
      'Cannot run prepare from awaiting-install.',
    )
    expect(await scene.readResult()).toMatchObject({
      status: 'failed',
      stage: 'awaiting-install',
      failureCount: 1,
      profileRemoved: false,
    })
    expect(
      await readFile(path.join(scene.runDir, 'failure-1.png'), 'utf8'),
    ).toBe('unit-test-screenshot')
    expect(await scene.readOperations()).toEqual([
      expect.objectContaining({ command: 'prepare', status: 'failed' }),
    ])
    await expect(access(scene.profileDir)).resolves.toBeUndefined()
  })

  it('retains screenshot failures and unknown commands as non-success evidence', async () => {
    const scene = await createLifecycle()
    scene.screenshot.mockRejectedValue('capture unavailable')
    await expect(scene.session.command('unsupported')).rejects.toThrow(
      'Unknown command.',
    )
    expect(await scene.readOperations()).toEqual([
      expect.objectContaining({ command: 'unsupported', status: 'failed' }),
      expect.objectContaining({
        command: 'failure-screenshot',
        status: 'failed',
        details: { error: 'capture unavailable' },
      }),
    ])
    expect(await scene.readResult()).toMatchObject({
      status: 'failed',
      failureCount: 1,
    })
  })

  it('aborts and removes only its owned profile, and repeated close is idempotent', async () => {
    const scene = await createLifecycle()
    await scene.session.command('abort')
    await scene.session.close()
    await scene.session.close()
    expect(await scene.readResult()).toMatchObject({
      status: 'failed',
      stage: 'aborted',
      profileRemoved: true,
    })
    await expect(access(scene.profileDir)).rejects.toThrow('ENOENT')
    expect(await readFile(path.join(scene.root, 'retained.txt'), 'utf8')).toBe(
      'outside owned profile',
    )
    expect(scene.close).toHaveBeenCalledTimes(1)
  })

  it('keeps the profile and records failed cleanup when the browser cannot close', async () => {
    const scene = await createLifecycle()
    scene.close.mockRejectedValue(new Error('Browser still running.'))
    await expect(scene.session.close()).rejects.toThrow(
      'Browser still running.',
    )
    await expect(access(scene.profileDir)).resolves.toBeUndefined()
    expect(await scene.readResult()).toMatchObject({
      status: 'failed',
      profileRemoved: false,
    })
    expect(await scene.readOperations()).toContainEqual(
      expect.objectContaining({
        command: 'cleanup',
        status: 'failed',
        details: { error: 'Browser still running.' },
      }),
    )
  })

  it.each([
    ['name', 'Another extension', 'not TABBIN'],
    ['id', 'different-id', 'does not match the official store listing'],
  ])(
    'rejects an unexpected installed extension %s',
    async (field, value, message) => {
      const scene = await createLifecycle()
      Reflect.set(scene.state.metadata, field, value)
      await expect(scene.session.command('installed')).rejects.toThrow(message)
      expect(await scene.readResult()).toMatchObject({
        status: 'failed',
        stage: 'awaiting-install',
      })
      expect(scene.newPage).not.toHaveBeenCalled()
    },
  )

  it('rejects a sideloaded extension presented as a store install', async () => {
    const scene = await createLifecycle()
    scene.state.installType = 'development'
    await expect(scene.session.command('installed')).rejects.toThrow(
      'Expected normal installation, observed development.',
    )
    expect(await scene.readResult()).toMatchObject({
      status: 'failed',
      stage: 'awaiting-install',
    })
  })

  it('records genuine source metadata and the actual initial settings without preparing saved data', async () => {
    const scene = await createLifecycle()
    await scene.session.command('installed')
    expect(
      JSON.parse(
        await readFile(path.join(scene.runDir, 'installation.json'), 'utf8'),
      ),
    ).toMatchObject({
      source: 'chrome-web-store',
      id: storeId,
      installType: 'normal',
      version: '2.0.19',
      initialStoredSettings: scene.state.storedSettings,
    })
    expect(await scene.readResult()).toMatchObject({
      status: 'running',
      stage: 'installed',
      saveFlow: { status: 'unverified' },
    })
    expect(scene.newPage).not.toHaveBeenCalled()
    expect(scene.route).not.toHaveBeenCalled()
  })

  it('records a missing worker instead of treating installation as complete', async () => {
    const scene = await createLifecycle()
    scene.serviceWorkers.mockReturnValue([])
    scene.pages.mockReturnValue([])
    await expect(scene.session.command('installed')).rejects.toThrow(
      'No extension service worker is available.',
    )
    expect(await scene.readResult()).toMatchObject({
      status: 'failed',
      stage: 'awaiting-install',
    })
    expect(scene.waitForEvent).toHaveBeenCalledTimes(1)
  })

  it('requires the real window-save setting before creating or closing tabs', async () => {
    const scene = await createLifecycle()
    await scene.session.command('installed')
    scene.state.storedSettings.clickBehavior = 'saveSameDomainTabs'
    await expect(scene.session.command('prepare')).rejects.toThrow(
      'Select Save all tabs in the window',
    )
    expect(await scene.readResult()).toMatchObject({
      status: 'failed',
      stage: 'installed',
      failureCount: 1,
    })
    expect(scene.newPage).not.toHaveBeenCalled()
    expect(scene.route).not.toHaveBeenCalled()
  })

  it('requires genuine toolbar pin state before changing any tabs', async () => {
    const scene = await createLifecycle()
    await scene.session.command('installed')
    scene.state.pinned = false
    await expect(scene.session.command('prepare')).rejects.toThrow(
      'Pin TABBIN in the native extensions menu',
    )
    expect(await scene.readResult()).toMatchObject({
      status: 'failed',
      stage: 'installed',
    })
    expect(scene.newPage).not.toHaveBeenCalled()
    expect(scene.route).not.toHaveBeenCalled()
  })

  it('rejects pre-existing persistence instead of reseeding or counting it as saved by the click', async () => {
    const scene = await createLifecycle()
    await scene.session.command('installed')
    scene.state.persistence.urls = [
      { id: 'previous-url', url: 'https://previous.filming.test/' },
    ]
    await expect(scene.session.command('prepare')).rejects.toThrow(
      'must have no saved tabs or categories',
    )
    expect(await scene.readResult()).toMatchObject({
      status: 'failed',
      stage: 'installed',
    })
    expect(scene.newPage).not.toHaveBeenCalled()
    expect(scene.route).not.toHaveBeenCalled()
  })
})
