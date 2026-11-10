import type { BrowserContext, Page, Worker } from '@playwright/test'

import { expect } from './extension'

export const currentWorker = async (
  context: BrowserContext,
  workerUrl: string,
): Promise<Worker> => {
  let current: Worker | undefined
  // Wait for one registry observation that also has a fresh execution realm.
  // A retained target is valid; a transient stale/overlapping view is not ready.
  await expect(async () => {
    const workers = context
      .serviceWorkers()
      .filter((worker) => worker.url() === workerUrl)
    expect(workers).toHaveLength(1)
    const [worker] = workers
    if (!worker) {
      throw new Error('The restarted extension worker is unavailable.')
    }
    expect(
      await worker.evaluate((): unknown =>
        Reflect.get(globalThis, '__tabbinWorkerLifetimeMarker'),
      ),
    ).toBeUndefined()
    current = worker
  }).toPass({ timeout: 5_000 })
  if (!current) {
    throw new Error('The restarted extension worker is unavailable.')
  }
  return current
}

export const stopWorker = async (
  extensionContext: BrowserContext,
  page: Page,
  serviceWorker: Worker,
) => {
  const cdp = await extensionContext.newCDPSession(page)
  let versionId: string | undefined
  let workerStatus: string | undefined
  cdp.on('ServiceWorker.workerVersionUpdated', ({ versions }) => {
    const version = versions.find(
      ({ scriptURL }) => scriptURL === serviceWorker.url(),
    )
    if (version) {
      versionId = version.versionId
      workerStatus = version.runningStatus
    }
  })
  await cdp.send('ServiceWorker.enable')
  await expect.poll(() => versionId).toBeDefined()
  if (!versionId) {
    throw new Error('The live MV3 service worker version was not found.')
  }
  await cdp.send('ServiceWorker.stopWorker', { versionId })
  // Chromium can retain the debugging target while destroying its execution
  // realm. Worker.close is not the service worker lifecycle completion signal.
  await expect.poll(() => workerStatus).toBe('stopped')

  return cdp
}
