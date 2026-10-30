import { execFileSync } from 'node:child_process'

import { expect, test } from '@playwright/test'

test('Firefox Academy uses real extension DOM for English direct access and Japanese keyboard revisit', () => {
  // Firefox's profile-copy loader does not install the unsigned addon on all
  // supported builds. Reuse the release smoke's temporary-XPI WebDriver session.
  const output = execFileSync(
    'bun',
    ['tools/scripts/firefox-persistence-indexeddb-smoke.ts'],
    { cwd: process.cwd(), env: process.env, encoding: 'utf8' },
  )
  const result: unknown = JSON.parse(output)
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
