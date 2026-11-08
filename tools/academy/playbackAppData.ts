import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'

// eslint-disable-next-line import/no-relative-parent-imports -- Reuse the repository's Firefox process isolation contract.
import { createFirefoxSmokeProcessEnvironment } from '../scripts/firefoxSmokeEnvironment'

type PlaybackAppData = {
  environment: Record<string, string | undefined>
  cleanup: () => Promise<void>
}

export const createPlaybackAppData = async (
  browserName: 'chromium' | 'firefox',
  output: string,
): Promise<PlaybackAppData | undefined> => {
  if (browserName !== 'firefox') {
    return undefined
  }
  const directory = await mkdtemp(path.join(output, `${browserName}-app-data-`))
  return {
    environment: createFirefoxSmokeProcessEnvironment({
      environment: process.env,
      platform: process.platform,
      appDataDirectory: directory,
    }),
    cleanup: async () => {
      try {
        await rm(directory, { recursive: true, force: true })
      } catch (error) {
        // macOS may protect folders it creates here. Do not alter their ACLs.
        console.warn(`Firefox app-data cleanup failed: ${directory}`, error)
      }
    },
  }
}
