/* eslint-disable playwright/no-skipped-test -- Firefox Academy smoke is gated by FIREFOX_EXTENSION_SMOKE=1 */
import { execFileSync } from 'node:child_process'

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

test('Firefox Academy uses real extension DOM for English direct access and Japanese keyboard revisit', () => {
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
  expect(result).toMatchObject({
    status: 'passed',
    academyUI: {
      englishDirect: true,
      japaneseKeyboard: true,
      invitationDismissed: true,
      narrowDarkReducedMotion: true,
      revisit: true,
      persistenceUnchanged: true,
    },
  })
})
