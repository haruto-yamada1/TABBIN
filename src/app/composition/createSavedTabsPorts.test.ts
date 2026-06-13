import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSavedTabsPorts } from './createSavedTabsPorts'

const setChromeApi = (api: unknown) => {
  ;(globalThis as { chrome?: unknown }).chrome = api
}

const restoreChromeApi = () => {
  delete (globalThis as { chrome?: unknown }).chrome
}

describe('createSavedTabsPorts (app/composition)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    restoreChromeApi()
  })

  afterEach(() => {
    restoreChromeApi()
  })

  describe('chrome.tabs が利用可能な環境', () => {
    it('browserTabPort.open が chrome.tabs.create を呼び結果の url を返す', async () => {
      // eslint-disable-next-line typescript/require-await -- mock 用に同期的な async を意図
      const create = vi.fn(async ({ url }: { url: string }) => ({ url }))
      setChromeApi({ tabs: { create } })

      const { browserTabPort } = createSavedTabsPorts()
      const result = await browserTabPort.open({ url: 'https://example.com' })

      expect(create).toHaveBeenCalledTimes(1)
      expect(create).toHaveBeenCalledWith({
        active: true,
        url: 'https://example.com',
      })
      expect(result).toStrictEqual({ url: 'https://example.com' })
    })

    it('chrome.tabs.create の戻り値に url が無い場合は引数の url をそのまま返す', async () => {
      // eslint-disable-next-line typescript/require-await -- mock 用に同期的な async を意図
      const create = vi.fn(async () => undefined)
      setChromeApi({ tabs: { create } })

      const { browserTabPort } = createSavedTabsPorts()
      const result = await browserTabPort.open({ url: 'https://example.com' })

      expect(result).toStrictEqual({ url: 'https://example.com' })
    })
  })

  describe('chrome.tabs が利用できない環境', () => {
    it('browserTabPort.open が Error を投げる', async () => {
      setChromeApi({})

      const { browserTabPort } = createSavedTabsPorts()
      await expect(
        browserTabPort.open({ url: 'https://example.com' }),
      ).rejects.toThrow('chrome.tabs.create is not available')
    })

    it('chrome 自体が未定義の環境でも browserTabPort.open が Error を投げる', async () => {
      const { browserTabPort } = createSavedTabsPorts()
      await expect(
        browserTabPort.open({ url: 'https://example.com' }),
      ).rejects.toThrow('chrome.tabs.create is not available')
    })
  })

  describe('options.resolveActive', () => {
    it('resolveActive=true の関数を渡すと browserTabPort が active: true で開く', async () => {
      // eslint-disable-next-line typescript/require-await -- mock 用に同期的な async を意図
      const create = vi.fn(async ({ url }: { url: string }) => ({ url }))
      setChromeApi({ tabs: { create } })

      const { browserTabPort } = createSavedTabsPorts({
        resolveActive: () => true,
      })
      await browserTabPort.open({ url: 'https://example.com' })

      expect(create).toHaveBeenCalledWith({
        active: true,
        url: 'https://example.com',
      })
    })

    it('resolveActive=false の関数を渡すと browserTabPort が active: false で開く', async () => {
      // eslint-disable-next-line typescript/require-await -- mock 用に同期的な async を意図
      const create = vi.fn(async ({ url }: { url: string }) => ({ url }))
      setChromeApi({ tabs: { create } })

      const { browserTabPort } = createSavedTabsPorts({
        resolveActive: () => false,
      })
      await browserTabPort.open({ url: 'https://example.com' })

      expect(create).toHaveBeenCalledWith({
        active: false,
        url: 'https://example.com',
      })
    })

    it('resolveActive は open ごとに呼ばれ、最新の戻り値を反映する', async () => {
      // eslint-disable-next-line typescript/require-await -- mock 用に同期的な async を意図
      const create = vi.fn(async ({ url }: { url: string }) => ({ url }))
      setChromeApi({ tabs: { create } })
      let active = false
      const { browserTabPort } = createSavedTabsPorts({
        resolveActive: () => active,
      })

      await browserTabPort.open({ url: 'https://example.com/first' })
      active = true
      await browserTabPort.open({ url: 'https://example.com/second' })

      expect(create).toHaveBeenNthCalledWith(1, {
        active: false,
        url: 'https://example.com/first',
      })
      expect(create).toHaveBeenNthCalledWith(2, {
        active: true,
        url: 'https://example.com/second',
      })
    })
  })

  describe('notificationPort', () => {
    it('info / success / error が関数として公開される', () => {
      const { notificationPort } = createSavedTabsPorts()
      expect(notificationPort.info).toBeTypeOf('function')
      expect(notificationPort.success).toBeTypeOf('function')
      expect(notificationPort.error).toBeTypeOf('function')
    })

    it('action 無しで info を呼んでも例外を投げない', () => {
      const { notificationPort } = createSavedTabsPorts()
      expect(() => notificationPort.info({ message: 'hello' })).not.toThrow()
    })
  })
})
