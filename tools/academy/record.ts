import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'

import { resetAcademyFixture } from '#academy-browser'
import type { AcademyScenario } from '#academy-fixture'
import { chromium, expect } from '@playwright/test'
import type { BrowserContext } from '@playwright/test'

const waitForRecordingEnd = async (
  context: BrowserContext,
  seconds: number | undefined,
): Promise<void> => {
  if (seconds !== undefined) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, seconds * 1000)
        }),
        context.waitForEvent('close', { timeout: 0 }),
      ])
    } finally {
      clearTimeout(timer)
    }
    return
  }
  const terminal = createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  try {
    await Promise.race([
      terminal.question(
        '録画中です。終了するには Enter を押すか、このテストブラウザを閉じてください。\n',
      ),
      context.waitForEvent('close', { timeout: 0 }),
    ])
  } finally {
    terminal.close()
  }
}

const recordScene = async (
  scenario: AcademyScenario,
  seconds: number | undefined,
): Promise<string> => {
  const profile = await mkdtemp(
    path.join(os.tmpdir(), 'tabbin-academy-recording-'),
  )
  const videoDir = path.resolve('recordings', 'academy')
  try {
    await mkdir(videoDir, { recursive: true })
    const extensionPath = path.resolve('.output', 'chrome-mv3')
    const context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: false,
      viewport: { width: 1280, height: 720 },
      recordVideo: { dir: videoDir, size: { width: 1280, height: 720 } },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    })
    try {
      const serviceWorker =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent('serviceworker'))
      // Use the existing E2E install boundary before replacing test state.
      await expect
        .poll(async () =>
          serviceWorker.evaluate(async () => {
            const storage = await chrome.storage.local.get('changelogShown')
            return storage.changelogShown
          }),
        )
        .toBe(true)
      const page = await context.newPage()
      await resetAcademyFixture(
        {
          extensionContext: context,
          extensionId: new URL(serviceWorker.url()).host,
          page,
          serviceWorker,
        },
        scenario,
      )
      await expect(page.getByTestId('sortable-url-item')).toHaveCount(
        scenario === 'minimal' ? 6 : 0,
      )
      const video = page.video()
      if (!video) {
        throw new Error('Recording did not start.')
      }
      const filename = await video.path()
      console.log(
        `一時プロファイルで ${scenario} を表示しました。通常のブラウザデータは使用していません。`,
      )
      await waitForRecordingEnd(context, seconds)
      return filename
    } finally {
      await context.close()
    }
  } finally {
    await rm(profile, { force: true, recursive: true })
  }
}

const { values } = parseArgs({
  options: {
    scenario: { type: 'string', default: 'minimal' },
    seconds: { type: 'string' },
  },
  strict: true,
})
if (values.scenario !== 'minimal' && values.scenario !== 'empty') {
  throw new Error('--scenario must be minimal or empty.')
}
const seconds =
  values.seconds === undefined ? undefined : Number(values.seconds)
if (seconds !== undefined && (!Number.isFinite(seconds) || seconds <= 0)) {
  throw new Error('--seconds must be a positive number.')
}
if (seconds === undefined && !process.stdin.isTTY) {
  throw new Error('Use an interactive terminal or provide --seconds.')
}
console.log(`Video saved: ${await recordScene(values.scenario, seconds)}`)
