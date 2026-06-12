import type { ProfilerOnRenderCallback } from 'react'

interface SavedTabsProfilerStats {
  actualDuration: number
  commits: number
  phase: string
}

type SavedTabsProfilerGlobal = typeof globalThis & {
  enableSavedTabsProfiler?: boolean
  savedTabsProfiler?: SavedTabsProfilerStats
}

const isDevProfileEnabled =
  import.meta.env.DEV &&
  Boolean((globalThis as SavedTabsProfilerGlobal).enableSavedTabsProfiler)

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
  ;(globalThis as SavedTabsProfilerGlobal).savedTabsProfiler = stats
  console.log(
    `[Profiler] SavedTabs commit #${savedTabsCommitCount} phase=${phase} actual=${actualDuration.toFixed(2)}ms`,
  )
}
export { handleSavedTabsRender, isDevProfileEnabled }
