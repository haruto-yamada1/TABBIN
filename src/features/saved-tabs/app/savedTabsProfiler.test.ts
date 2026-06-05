import { afterEach, describe, expect, it, vi } from 'vitest'

type ProfilerGlobal = typeof globalThis & {
  enableSavedTabsProfiler?: boolean
  savedTabsProfiler?: {
    actualDuration: number
    commits: number
    phase: string
  }
}

const profilerGlobal = globalThis as ProfilerGlobal

describe('savedTabsProfiler', () => {
  afterEach(() => {
    delete profilerGlobal.enableSavedTabsProfiler
    delete profilerGlobal.savedTabsProfiler
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('flag が無効な場合と対象 id でない場合は記録しない', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { handleSavedTabsRender, isDevProfileEnabled } =
      await import('./savedTabsProfiler')

    handleSavedTabsRender('SavedTabs', 'mount', 12.34, 0, 0, 0)
    handleSavedTabsRender('Other', 'update', 56.78, 0, 0, 0)

    expect(isDevProfileEnabled).toBe(false)
    expect(profilerGlobal.savedTabsProfiler).toBeUndefined()
    expect(consoleLog).not.toHaveBeenCalled()
  })

  it('flag が有効な場合は SavedTabs の render 統計を記録する', async () => {
    profilerGlobal.enableSavedTabsProfiler = true
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    const { handleSavedTabsRender, isDevProfileEnabled } =
      await import('./savedTabsProfiler')

    handleSavedTabsRender('SavedTabs', 'mount', 12.34, 0, 0, 0)
    handleSavedTabsRender('SavedTabs', 'update', 56.78, 0, 0, 0)

    expect(isDevProfileEnabled).toBe(true)
    expect(profilerGlobal.savedTabsProfiler).toEqual({
      actualDuration: 56.78,
      commits: 2,
      phase: 'update',
    })
    expect(consoleLog).toHaveBeenLastCalledWith(
      '[Profiler] SavedTabs commit #2 phase=update actual=56.78ms',
    )
  })
})
