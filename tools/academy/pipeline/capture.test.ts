import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { seedSavedTabsFixture } from '#academy-extension'
import { chromium } from '@playwright/test'
import type {
  Browser,
  BrowserContext,
  Locator,
  Page,
  Request,
  Route,
  WebSocketRoute,
  Worker,
} from '@playwright/test'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { captureLaunchOptions, capturePage } from './capture'
import type { CapturePageOptions, PageAction } from './capture'

vi.mock('#academy-extension', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>()
  return { ...original, seedSavedTabsFixture: vi.fn() }
})

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  await Promise.all(
    roots
      .splice(0)
      .map(async (root) => rm(root, { recursive: true, force: true })),
  )
})

describe('Academy page capture launch contract', () => {
  it('owns its profile and fixes presentation inputs without exposing profile overrides', () => {
    const options = captureLaunchOptions({ width: 1280, height: 720 })
    expect(options).toMatchObject({
      channel: 'chromium',
      headless: false,
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      locale: 'ja-JP',
      timezoneId: 'UTC',
      colorScheme: 'light',
      reducedMotion: 'reduce',
      offline: true,
    })
    expect(options.recordVideo).toBeUndefined()
    expect(options.args).toContain(
      `--load-extension=${path.resolve('.output/chrome-mv3')}`,
    )
    expect(options.args).not.toContain('--no-sandbox')
  })

  it.each([
    { width: 0, height: 720 },
    { width: 1280.5, height: 720 },
    { width: 1280, height: Number.NaN },
  ])('rejects invalid recording dimensions %j', (viewport) => {
    expect(() => captureLaunchOptions(viewport)).toThrow('viewport')
  })
})

const createLifecycle = async () => {
  const runDir = await mkdtemp(path.join(os.tmpdir(), 'tabbin-capture-test-'))
  roots.push(runDir)
  const videoFile = path.join(runDir, 'page-clips', 'continuation.webm')
  const headingFactory = vi.fn<() => Locator>()
  vi.mocked(headingFactory, { partial: true }).mockReturnValue({
    allTextContents: vi.fn(async () => [
      'notes.filming.test',
      'study.filming.test',
    ]),
  })
  const domainWaitFor = vi.fn<Locator['waitFor']>().mockResolvedValue(undefined)
  const focusedElement = {
    style: { outline: '1px dotted blue', outlineOffset: '2px' },
  } as unknown as HTMLElement
  const domainEvaluate = vi.fn(async (callback: unknown, arg: unknown) => {
    if (typeof callback !== 'function') {
      throw new TypeError('Only a browser evaluation callback is supported.')
    }
    return callback(focusedElement, arg)
  })
  const domainHover = vi.fn<Locator['hover']>().mockResolvedValue(undefined)
  const domainFactory = vi.fn<() => Locator>()
  vi.mocked(domainFactory, { partial: true }).mockReturnValue({
    waitFor: domainWaitFor,
    scrollIntoViewIfNeeded: vi.fn(async () => undefined),
    hover: domainHover,
    evaluate: domainEvaluate,
  })
  const domain = domainFactory()
  const cardsFactory = vi.fn<() => Locator>()
  vi.mocked(cardsFactory, { partial: true }).mockReturnValue({
    getByRole: vi.fn(() => headingFactory()),
    filter: vi.fn(() => domain),
  })
  const cards = cardsFactory()
  const countFactory = vi.fn<() => Locator>()
  vi.mocked(countFactory, { partial: true }).mockReturnValue({
    count: async () => 4,
  })
  const locator = vi.fn<Page['locator']>((selector) => {
    if (selector === '[data-tour="academy-domain"]') {
      return cards
    }
    throw new Error(`Unexpected selector: ${selector}`)
  })
  const getByTestId = vi.fn<Page['getByTestId']>((id) => {
    if (id === 'domain-scroll-target') {
      return cards
    }
    if (id === 'sortable-url-item') {
      return countFactory()
    }
    throw new Error(`Unexpected test ID: ${String(id)}`)
  })
  const screenshot = vi
    .fn<Page['screenshot']>()
    .mockImplementation(async (options) => {
      if (options?.path) {
        await writeFile(options.path, 'failure screenshot')
      }
      return Buffer.from('failure screenshot')
    })
  const clockFactory = vi.fn<() => Page['clock']>()
  vi.mocked(clockFactory, { partial: true }).mockReturnValue({
    setFixedTime: vi.fn(async () => undefined),
  })
  const disposable = {
    dispose: async () => undefined,
    [Symbol.asyncDispose]: async () => undefined,
  }
  const screencastStart = vi
    .fn<Page['screencast']['start']>()
    .mockResolvedValue(disposable)
  const screencastStop = vi
    .fn<Page['screencast']['stop']>()
    .mockImplementation(async () => {
      await writeFile(videoFile, 'finalized video')
    })
  const screencastFactory = vi.fn<() => Page['screencast']>()
  vi.mocked(screencastFactory, { partial: true }).mockReturnValue({
    start: screencastStart,
    stop: screencastStop,
  })
  const pageFactory = vi.fn<() => Page>()
  vi.mocked(pageFactory, { partial: true }).mockReturnValue({
    clock: clockFactory(),
    screencast: screencastFactory(),
    goto: vi.fn(async () => null),
    screenshot,
    locator,
    getByTestId,
    getByRole: vi.fn(),
    close: vi.fn(async () => undefined),
  })
  const page = pageFactory()
  const workerFactory = vi.fn<() => Worker>()
  vi.mocked(workerFactory, { partial: true }).mockReturnValue({
    url: () => 'chrome-extension://test-extension/background.js',
    evaluate: vi.fn(async () => true),
  })
  const worker = workerFactory()
  const startTrace = vi
    .fn<BrowserContext['tracing']['start']>()
    .mockResolvedValue(disposable)
  const stopTrace = vi.fn(async (options: { path: string }) => {
    await writeFile(options.path, 'trace')
  })
  const close = vi.fn(async () => undefined)
  const route = vi.fn<BrowserContext['route']>()
  const routeWebSocket = vi.fn<BrowserContext['routeWebSocket']>()
  const browserFactory = vi.fn<() => Browser>()
  vi.mocked(browserFactory, { partial: true }).mockReturnValue({
    version: () => '156.0.8078.4',
  })
  const tracingFactory = vi.fn<() => BrowserContext['tracing']>()
  vi.mocked(tracingFactory, { partial: true }).mockReturnValue({
    start: startTrace,
    stop: stopTrace,
  })
  const contextFactory = vi.fn<() => BrowserContext>()
  vi.mocked(contextFactory, { partial: true }).mockReturnValue({
    browser: () => browserFactory(),
    tracing: tracingFactory(),
    route,
    routeWebSocket,
    serviceWorkers: () => [worker],
    newPage: vi.fn(async () => page),
    pages: () => [],
    close,
  })
  const context = contextFactory()
  const launch = vi
    .spyOn(chromium, 'launchPersistentContext')
    .mockResolvedValue(context)
  const options: CapturePageOptions = {
    runDir,
    snapshot: {
      categories: [],
      collections: [],
      groups: [],
      memberships: [],
      urls: Array.from({ length: 4 }, (_, index) => ({ id: `url-${index}` })),
    },
    actions: [
      {
        type: 'assert-domains',
        hostnames: ['study.filming.test', 'notes.filming.test'],
      },
      { type: 'assert-urls', count: 4 },
      { type: 'focus-domain', hostname: 'notes.filming.test', holdSeconds: 0 },
    ],
    viewport: { width: 1280, height: 720 },
    browserVersion: '156.0.8078.4',
  }
  return {
    options,
    launch,
    context,
    page,
    domainWaitFor,
    domainHover,
    focusedElement,
    route,
    routeWebSocket,
    close,
    startTrace,
    stopTrace,
    screencastStart,
    screencastStop,
  }
}

describe('Academy page capture lifecycle', () => {
  it('records a verified snapshot continuation and returns only after video finalization', async () => {
    const lifecycle = await createLifecycle()
    const result = await capturePage(lifecycle.options)
    expect(result.browserVersion).toBe(lifecycle.options.browserVersion)
    expect(result.file).toBe('page-clips/continuation.webm')
    expect(
      await readFile(path.join(lifecycle.options.runDir, result.file), 'utf8'),
    ).toBe('finalized video')
    expect(result.durationSeconds).toBeGreaterThanOrEqual(0)
    expect(result.actionLog).toHaveLength(3)
    expect(lifecycle.domainWaitFor).toHaveBeenCalledWith({ state: 'visible' })
    expect(result.contentStartSeconds).toBe(0)
    expect(lifecycle.screencastStart).toHaveBeenCalledWith({
      path: path.join(lifecycle.options.runDir, result.file),
      size: lifecycle.options.viewport,
      fps: 30,
    })
    expect(lifecycle.startTrace).toHaveBeenCalledWith({
      screenshots: false,
      snapshots: true,
      sources: true,
    })
    expect(
      vi.mocked(seedSavedTabsFixture).mock.invocationCallOrder[0],
    ).toBeLessThan(lifecycle.screencastStart.mock.invocationCallOrder[0] ?? 0)
    expect(lifecycle.screencastStop.mock.invocationCallOrder[0]).toBeLessThan(
      lifecycle.close.mock.invocationCallOrder[0] ?? 0,
    )
    expect(seedSavedTabsFixture).toHaveBeenCalledWith(expect.anything(), {
      persistence: lifecycle.options.snapshot,
      storage: expect.objectContaining({ 'tab-manager-theme': 'light' }),
    })
    expect(lifecycle.startTrace.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(seedSavedTabsFixture).mock.invocationCallOrder[0] ?? 0,
    )
    const profile = lifecycle.launch.mock.calls[0]?.[0]
    expect(profile).toMatch(/tabbin-academy-page-/u)
    await expect(access(String(profile))).rejects.toThrow('ENOENT')
    const summary = JSON.parse(
      await readFile(
        path.join(lifecycle.options.runDir, 'capture-result.json'),
        'utf8',
      ),
    )
    expect(summary.status).toBe('passed')
    expect(summary.profileRemoved).toBe(true)
  })

  it('blocks external page requests while allowing only the owned extension origin', async () => {
    const lifecycle = await createLifecycle()
    await capturePage(lifecycle.options)
    const handler = lifecycle.route.mock.calls[0]?.[1]
    expect(handler).toBeTypeOf('function')
    const abort = vi.fn(async () => undefined)
    const resume = vi.fn(async () => undefined)
    if (typeof handler !== 'function') {
      throw new TypeError('Expected a route handler.')
    }
    const requestFactory = vi.fn<() => Request>()
    vi.mocked(requestFactory, { partial: true }).mockReturnValue({
      url: () => 'https://external.example/private?secret=value',
    })
    const request = requestFactory()
    const routeFactory = vi.fn<() => Route>()
    vi.mocked(routeFactory, { partial: true }).mockReturnValue({
      request: () => request,
      abort,
      continue: resume,
    })
    await handler(routeFactory(), request)
    expect(abort).toHaveBeenCalledOnce()
    expect(resume).not.toHaveBeenCalled()
    const websocketHandler = lifecycle.routeWebSocket.mock.calls[0]?.[1]
    if (!websocketHandler) {
      throw new TypeError('Expected an offline WebSocket boundary.')
    }
    const socketClose = vi.fn()
    const socketFactory = vi.fn<() => WebSocketRoute>()
    vi.mocked(socketFactory, { partial: true }).mockReturnValue({
      close: socketClose,
    })
    await websocketHandler(socketFactory())
    expect(socketClose).toHaveBeenCalledWith({
      code: 1008,
      reason: 'Academy capture is offline.',
    })
  })

  it('visibly emphasizes the actual domain while focused and restores its original style', async () => {
    const lifecycle = await createLifecycle()
    lifecycle.domainHover.mockImplementation(async () => {
      expect(lifecycle.focusedElement.style.outline).toBe('3px solid #16a34a')
      expect(lifecycle.focusedElement.style.outlineOffset).toBe('-3px')
      throw new Error('Pointer interaction failed')
    })
    await expect(capturePage(lifecycle.options)).rejects.toThrow(
      'Pointer interaction failed',
    )
    expect(lifecycle.focusedElement.style.outline).toBe('1px dotted blue')
    expect(lifecycle.focusedElement.style.outlineOffset).toBe('2px')
  })

  it('rejects a different bundled browser before seeding and retains failure evidence', async () => {
    const lifecycle = await createLifecycle()
    await expect(
      capturePage({ ...lifecycle.options, browserVersion: '155.0.0.0' }),
    ).rejects.toThrow('browser version')
    expect(seedSavedTabsFixture).not.toHaveBeenCalled()
    expect(lifecycle.close).toHaveBeenCalledOnce()
    const summary = JSON.parse(
      await readFile(
        path.join(lifecycle.options.runDir, 'capture-result.json'),
        'utf8',
      ),
    )
    expect(summary).toMatchObject({
      status: 'failed',
      actionIndex: null,
      profileRemoved: true,
    })
    await expect(
      access(path.join(lifecycle.options.runDir, 'capture-trace.zip')),
    ).resolves.toBeUndefined()
  })

  it('keeps action failure, screenshot and trace without returning a successful artifact', async () => {
    const lifecycle = await createLifecycle()
    lifecycle.domainWaitFor.mockRejectedValue(
      new Error('Domain never became visible'),
    )
    await expect(capturePage(lifecycle.options)).rejects.toThrow(
      'Domain never became visible',
    )
    const summary = JSON.parse(
      await readFile(
        path.join(lifecycle.options.runDir, 'capture-result.json'),
        'utf8',
      ),
    )
    expect(summary).toMatchObject({
      status: 'failed',
      actionIndex: 2,
      profileRemoved: true,
    })
    expect(summary.errors).toContain('Domain never became visible')
    await expect(
      access(path.join(lifecycle.options.runDir, 'capture-failure.png')),
    ).resolves.toBeUndefined()
    await expect(
      access(path.join(lifecycle.options.runDir, 'capture-trace.zip')),
    ).resolves.toBeUndefined()
  })

  it('does not report success when browser cleanup fails', async () => {
    const lifecycle = await createLifecycle()
    lifecycle.close.mockRejectedValue(new Error('Browser close failed'))
    await expect(capturePage(lifecycle.options)).rejects.toThrow(
      'Browser close failed',
    )
    const summary = JSON.parse(
      await readFile(
        path.join(lifecycle.options.runDir, 'capture-result.json'),
        'utf8',
      ),
    )
    expect(summary).toMatchObject({ status: 'failed', profileRemoved: false })
    const profile = lifecycle.launch.mock.calls[0]?.[0]
    roots.push(String(profile))
  })

  it('retains a failed launch log and removes its owned temporary profile', async () => {
    const lifecycle = await createLifecycle()
    lifecycle.launch.mockRejectedValue(new Error('Browser launch denied'))
    await expect(capturePage(lifecycle.options)).rejects.toThrow(
      'Browser launch denied',
    )
    const summary = JSON.parse(
      await readFile(
        path.join(lifecycle.options.runDir, 'capture-result.json'),
        'utf8',
      ),
    )
    expect(summary).toMatchObject({
      status: 'failed',
      actionIndex: null,
      profileRemoved: true,
      file: null,
    })
    expect(lifecycle.close).not.toHaveBeenCalled()
    await expect(
      access(String(lifecycle.launch.mock.calls[0]?.[0])),
    ).rejects.toThrow('ENOENT')
    const log = await readFile(
      path.join(lifecycle.options.runDir, 'capture-log.jsonl'),
      'utf8',
    )
    expect(JSON.parse(log)).toMatchObject({
      index: null,
      status: 'failed',
      error: 'Browser launch denied',
    })
  })

  it('rejects an unflushed recording and still closes the context', async () => {
    const lifecycle = await createLifecycle()
    lifecycle.screencastStop.mockRejectedValue(
      new Error('Recording flush failed'),
    )
    await expect(capturePage(lifecycle.options)).rejects.toThrow(
      'Recording flush failed',
    )
    const summary = JSON.parse(
      await readFile(
        path.join(lifecycle.options.runDir, 'capture-result.json'),
        'utf8',
      ),
    )
    expect(summary).toMatchObject({
      status: 'failed',
      profileRemoved: true,
      file: null,
    })
    expect(lifecycle.close).toHaveBeenCalledOnce()
  })

  it('rejects missing trace evidence even after the page actions succeeded', async () => {
    const lifecycle = await createLifecycle()
    lifecycle.stopTrace.mockRejectedValue(new Error('Trace archive failed'))
    await expect(capturePage(lifecycle.options)).rejects.toThrow(
      'Trace archive failed',
    )
    const summary = JSON.parse(
      await readFile(
        path.join(lifecycle.options.runDir, 'capture-result.json'),
        'utf8',
      ),
    )
    expect(summary).toMatchObject({
      status: 'failed',
      profileRemoved: true,
      file: null,
    })
    expect(lifecycle.close).toHaveBeenCalledOnce()
  })

  it.each([
    {
      type: 'focus-domain',
      hostname: 'https://personal.example',
      holdSeconds: 1,
    },
    { type: 'focus-domain', hostname: 'notes.filming.test', holdSeconds: -1 },
    { type: 'assert-urls', count: 1.5 },
    { type: 'assert-domains', hostnames: ['notes.filming.test'], extra: true },
    { type: 'assert-urls', count: 1, extra: true },
    {
      type: 'focus-domain',
      hostname: 'notes.filming.test',
      holdSeconds: 0,
      extra: true,
    },
    { type: 'assert-domains', hostnames: [] },
    { type: 'arbitrary-script', script: 'not allowed' },
  ])('rejects invalid scenario action %j before launching', async (action) => {
    const lifecycle = await createLifecycle()
    await expect(
      capturePage({ ...lifecycle.options, actions: [action as PageAction] }),
    ).rejects.toThrow('action')
    expect(lifecycle.launch).not.toHaveBeenCalled()
  })
})
