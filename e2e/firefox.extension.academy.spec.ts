/* eslint-disable playwright/no-skipped-test -- Firefox Academy smoke is gated by FIREFOX_EXTENSION_SMOKE=1 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

import {
  expect,
  isFirefoxExtensionSmokeEnabled,
  test,
} from './helpers/firefox-extension'

test.beforeAll(() => {
  test.skip(
    !isFirefoxExtensionSmokeEnabled(),
    'set FIREFOX_EXTENSION_SMOKE=1 to run the Firefox Academy smoke',
  )
})

test('Firefox Academy verifies read-only screen guides and Japanese keyboard revisit in the real extension DOM', async () => {
  // Firefox's profile-copy loader does not install the unsigned addon on all
  // supported builds. Reuse the release smoke's temporary-XPI WebDriver session.
  const output = execFileSync('bun', ['run', 'test:firefox:indexeddb-smoke'], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
  })
  // The package command prints build logs before the runner's final JSON.
  const result: unknown = JSON.parse(
    output.slice(output.lastIndexOf('\n{') + 1),
  )
  const proofPath = test.info().outputPath('academy-native-proof.json')
  writeFileSync(proofPath, `${JSON.stringify(result, null, 2)}\n`)
  await test.info().attach('academy-native-proof', {
    path: proofPath,
    contentType: 'application/json',
  })
  expect(result).toMatchObject({
    status: 'passed',
    academyUI: {
      englishDirect: true,
      japaneseKeyboard: true,
      narrowDarkReducedMotion: true,
      revisit: true,
      persistenceUnchanged: true,
      screenGuide: true,
      parentGuide: true,
      quality: {
        lessonPaths: 8,
        videoVariants: 16,
        captionLanguages: ['ja', 'en'],
        noAutoplay: true,
        manualPlayback: true,
        progressIndependent: true,
        persistenceUnchanged: true,
        tabsUnchanged: true,
      },
      domainPractice: {
        parentComplete: true,
        childComplete: true,
        reorderComplete: true,
        restoreSimulated: true,
        rewindResetSkip: true,
        japaneseNarrow: true,
        nativeCalls: 0,
        persistenceUnchanged: true,
        tabsUnchanged: true,
      },
    },
  })
})
