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
const output = path.resolve('src/public/academy/videos')
await mkdir(output, { recursive: true })
const assets: Record<string, unknown> = {}
await Promise.all(
  (['ja', 'en'] as const).map(async (locale) => {
    // Decode and check the actual file again before adding it to the product.
    const verification = await verifyLessonArtifacts(
      directories[locale],
      scenario,
    )
    const name = `${scenario.lessonId}.${locale}.mp4`
    const source = path.join(directories[locale], scenario.output.filename)
    const temporary = path.join(output, `${name}.tmp`)
    await copyFile(source, temporary)
    await rename(temporary, path.join(output, name))
    await copyFile(
      path.join(directories[locale], `${scenario.id}.${locale}.vtt`),
      path.join(output, `${scenario.lessonId}.${locale}.vtt`),
    )
    assets[locale] = { ...verification, sha256: await fileDigest(source) }
  }),
)
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
const manifest = {
  lessonId: scenario.lessonId,
  version: scenario.version,
  updatedAt: '2026-11-08',
  scenarioSha256: await fileDigest(
    path.resolve('tools/academy/scenarios', `${scenario.id}.json`),
  ),
  browser: scenario.browserVersion,
  nativeStoreVersion: '2.0.19',
  captionMode: 'tracks',
  narration: false,
  assets,
}
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
