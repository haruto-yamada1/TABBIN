import type { ProfilerOnRenderCallback } from 'react'

type SavedTabsProfilerStats = {
  actualDuration: number
  commits: number
  phase: string
}

type SavedTabsProfilerGlobal = typeof globalThis & {
  enableSavedTabsProfiler?: boolean
  savedTabsProfiler?: SavedTabsProfilerStats
}

const getSavedTabsProfilerGlobal = (): SavedTabsProfilerGlobal => globalThis

const isDevProfileEnabled =
  import.meta.env.DEV &&
  Boolean(getSavedTabsProfilerGlobal().enableSavedTabsProfiler)

let savedTabsCommitCount = 0
const handleSavedTabsRender: ProfilerOnRenderCallback = (
  id,
  phase,
  actualDuration,
) => {
  if (!isDevProfileEnabled || id !== 'SavedTabs') {
    return
  }

  savedTabsCommitCount += 1
  const stats: SavedTabsProfilerStats = {
    actualDuration,
    commits: savedTabsCommitCount,
    phase,
  }
  getSavedTabsProfilerGlobal().savedTabsProfiler = stats
  console.log(
    `[Profiler] SavedTabs commit #${savedTabsCommitCount} phase=${phase} actual=${actualDuration.toFixed(2)}ms`,
  )
}
export { handleSavedTabsRender, isDevProfileEnabled }
