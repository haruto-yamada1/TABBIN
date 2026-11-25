import {
  copyFile,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { fileDigest, verifyLessonArtifacts } from './pipeline/artifacts'
import { runMediaCommand } from './pipeline/render'
import { parseScenario } from './pipeline/scenario'
import type { Locale } from './pipeline/scenario'
import {
  createPublicationManifest,
  readNativeStoreVersion,
} from './publicationManifest'

const { values } = parseArgs({
  options: { ja: { type: 'string' }, en: { type: 'string' } },
  strict: true,
})
if (!values.ja || !values.en) {
  throw new Error('Use --ja and --en with verified render directories.')
}
const directories = { ja: path.resolve(values.ja), en: path.resolve(values.en) }
const scenario = parseScenario(
  JSON.parse(
    await readFile(path.join(directories.ja, 'scenario.json'), 'utf8'),
  ),
)
const english = parseScenario(
  JSON.parse(
    await readFile(path.join(directories.en, 'scenario.json'), 'utf8'),
  ),
)
if (
  JSON.stringify(scenario) !== JSON.stringify(english) ||
  scenario.captionMode !== 'tracks'
) {
  throw new Error(
    'Localized renders must share the same track-caption scenario.',
  )
}
const currentScenario = parseScenario(
  JSON.parse(
    await readFile(
      path.resolve('tools/academy/scenarios', `${scenario.id}.json`),
      'utf8',
    ),
  ),
)
if (JSON.stringify(currentScenario) !== JSON.stringify(scenario)) {
  throw new Error(
    'Current scenario differs from the rendered input. Regenerate before publishing.',
  )
}
const nativeStoreVersion = await readNativeStoreVersion(directories)
const [japaneseVerification, englishVerification] = await Promise.all([
  verifyLessonArtifacts(directories.ja, scenario),
  verifyLessonArtifacts(directories.en, scenario),
])
const verified = { ja: japaneseVerification, en: englishVerification }
const output = path.resolve('src/public/academy/videos')
await mkdir(output, { recursive: true })
const publishAsset = async (locale: Locale) => {
  const name = `${scenario.lessonId}.${locale}.mp4`
  const source = path.join(directories[locale], scenario.output.filename)
  const temporary = path.join(output, `${name}.tmp`)
  await copyFile(source, temporary)
  await rename(temporary, path.join(output, name))
  await copyFile(
    path.join(directories[locale], `${scenario.id}.${locale}.vtt`),
    path.join(output, `${scenario.lessonId}.${locale}.vtt`),
  )
  return { ...verified[locale], sha256: await fileDigest(source) }
}
const [japaneseAsset, englishAsset] = await Promise.all([
  publishAsset('ja'),
  publishAsset('en'),
])
const assets = { ja: japaneseAsset, en: englishAsset }
const poster = `${scenario.lessonId}.poster.jpg`
const firstClip = scenario.segments.findIndex(
  (segment) => segment.kind !== 'card',
)
const posterTime =
  scenario.segments
    .slice(0, firstClip)
    .reduce((sum, segment) => sum + segment.seconds, 0) + 5
const posterTemp = path.join(output, `${poster}.tmp.jpg`)
try {
  await runMediaCommand(directories.ja, 'ffmpeg', [
    '-nostdin',
    '-hide_banner',
    '-loglevel',
    'error',
    '-y',
    '-ss',
    String(posterTime),
    '-i',
    path.join(output, `${scenario.lessonId}.ja.mp4`),
    '-frames:v',
    '1',
    '-q:v',
    '3',
    posterTemp,
  ])
  await rename(posterTemp, path.join(output, poster))
} finally {
  await rm(posterTemp, { force: true })
}
const manifest = createPublicationManifest({
  scenario,
  nativeStoreVersion,
  scenarioSha256: await fileDigest(
    path.resolve('tools/academy/scenarios', `${scenario.id}.json`),
  ),
  assets,
})
await writeFile(
  path.join(output, `${scenario.lessonId}.json`),
  `${JSON.stringify(manifest, null, 2)}\n`,
)
console.log(
  JSON.stringify({
    status: 'published-locally',
    lessonId: scenario.lessonId,
    assets,
  }),
)
