import { describe, expect, it, vi } from 'vitest'

import { createSavedTabTitleState } from './saved-tab-title-state'

const A = 'https://example.com/a'
const B = 'https://example.com/b'
const setup = () => {
  const readEnabled = vi.fn(async () => true)
  const readSavedUrls = vi.fn(
    async (): Promise<ReadonlySet<string>> => new Set([A]),
  )
  const queryTabs = vi.fn(async () => [
    { id: 1, url: A, incognito: false },
    { id: 2, url: B, incognito: false },
  ])
  const apply = vi.fn(async () => {})
  const restore = vi.fn(async () => {})
  const state = createSavedTabTitleState({
    readEnabled,
    readSavedUrls,
    queryTabs,
    apply,
    restore,
  })
  return { state, readEnabled, readSavedUrls, queryTabs, apply, restore }
}
describe('native saved tab title state', () => {
  it('marks only exact saved URLs and restores all other previously marked tabs', async () => {
    const f = setup()
    await f.state.refresh()
    expect(f.apply).toHaveBeenCalledExactlyOnceWith(1, A)
    expect(f.restore).toHaveBeenCalledExactlyOnceWith(2)
    await f.state.update({ id: 1, url: `${A}#other`, incognito: false })
    expect(f.restore).toHaveBeenLastCalledWith(1)
    await f.state.update({ id: 2, url: A, incognito: false })
    expect(f.apply).toHaveBeenLastCalledWith(2, A)
    expect(f.readSavedUrls).toHaveBeenCalledTimes(1)
    expect(f.queryTabs).toHaveBeenCalledTimes(1)
  })

  it('does not read saved data or inject when disabled, and restores on disable/revocation', async () => {
    const f = setup()
    f.readEnabled.mockResolvedValue(false)
    await f.state.refresh()
    expect(f.readSavedUrls).not.toHaveBeenCalled()
    expect(f.apply).not.toHaveBeenCalled()
    expect(f.restore).toHaveBeenCalledTimes(2)
    f.readEnabled.mockResolvedValue(true)
    await f.state.refresh()
    f.readEnabled.mockResolvedValue(false)
    await f.state.refresh()
    expect(f.restore).toHaveBeenLastCalledWith(2)
    expect(f.readSavedUrls).toHaveBeenCalledTimes(1)
  })

  it('excludes private, unknown-scope and browser/internal tabs', async () => {
    const f = setup()
    await f.state.refresh()
    f.apply.mockClear()
    f.restore.mockClear()
    for (const tab of [
      { id: 3, url: A, incognito: true },
      { id: 4, url: A },
      { id: 5, url: 'chrome://settings', incognito: false },
      { id: 6, url: 'file:///private/data', incognito: false },
      { url: A, incognito: false },
    ]) {
      // eslint-disable-next-line eslint/no-await-in-loop -- independently verify each rejected tab
      await f.state.update(tab)
    }
    expect(f.apply).not.toHaveBeenCalled()
    expect(f.restore).not.toHaveBeenCalled()
  })

  it('fails closed on a saved-data read failure without blocking later recovery', async () => {
    const f = setup()
    f.readSavedUrls.mockRejectedValueOnce(new Error('private diagnostic'))
    await expect(f.state.refresh()).resolves.toBeUndefined()
    expect(f.apply).not.toHaveBeenCalled()
    expect(f.restore).toHaveBeenCalledTimes(2)
    await f.state.refresh()
    expect(f.apply).toHaveBeenCalledWith(1, A)
  })

  it('serializes per-tab writes so a pending mark cannot win after disable', async () => {
    const f = setup()
    let finish: () => void = () => {}
    f.apply.mockImplementationOnce(
      async () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    const first = f.state.refresh()
    await vi.waitFor(() => expect(f.apply).toHaveBeenCalled())
    f.readEnabled.mockResolvedValue(false)
    const second = f.state.refresh()
    finish()
    await first
    await second
    expect(f.restore).toHaveBeenCalledWith(1)
    expect(f.readEnabled).toHaveBeenCalledTimes(2)
  })

  it('contains browser/injection failures and avoids user-data diagnostics', async () => {
    const f = setup()
    f.apply.mockRejectedValueOnce(new Error('tab vanished'))
    await expect(f.state.refresh()).resolves.toBeUndefined()
    f.queryTabs.mockRejectedValueOnce(new Error('browser unavailable'))
    await expect(f.state.refresh()).resolves.toBeUndefined()
    f.state.removed(1)
    await expect(
      f.state.update({ id: 1, url: A, incognito: false }),
    ).resolves.toBeUndefined()
  })
})
