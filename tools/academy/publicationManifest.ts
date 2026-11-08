import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { z } from 'zod'

import type { LessonScenario, Locale } from './pipeline/scenario'
import { installationSchema } from './recording/nativeEvidence'

const nativeEvidenceSchema = z.object({ installation: installationSchema })

type PublicationManifestInput = {
  scenario: LessonScenario
  scenarioSha256: string
  nativeStoreVersion: string
  assets: Record<Locale, unknown>
}

export const readNativeStoreVersion = async (
  directories: Record<Locale, string>,
): Promise<string> => {
  const readVersion = async (locale: Locale) => {
    const file = path.join(directories[locale], 'native-evidence.json')
    let evidence: unknown
    try {
      evidence = JSON.parse(await readFile(file, 'utf8'))
    } catch (error) {
      throw new Error(
        `Native recording evidence could not be read: ${locale}`,
        {
          cause: error,
        },
      )
    }
    const parsed = nativeEvidenceSchema.safeParse(evidence)
    if (!parsed.success || parsed.data.installation.version.trim() === '') {
      throw new Error(`Native installation evidence is invalid: ${locale}`)
    }
    return parsed.data.installation.version
  }
  const [japaneseVersion, englishVersion] = await Promise.all([
    readVersion('ja'),
    readVersion('en'),
  ])
  if (japaneseVersion !== englishVersion) {
    throw new Error(
      'Localized renders have different native installation versions.',
    )
  }
  return japaneseVersion
}

export const createPublicationManifest = ({
  scenario,
  scenarioSha256,
  nativeStoreVersion,
  assets,
}: PublicationManifestInput) => ({
  lessonId: scenario.lessonId,
  version: scenario.version,
  updatedAt: new Date().toISOString().slice(0, 10),
  scenarioSha256,
  browser: scenario.browserVersion,
  nativeStoreVersion,
  captionMode: 'tracks',
  narration: false,
  assets: { ja: assets.ja, en: assets.en },
})
