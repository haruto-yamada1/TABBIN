import assert from 'node:assert/strict'

import { runFirefoxDomainPracticeSmoke } from './firefoxDomainPracticeSmoke'

type Commands = <Value = unknown>(
  path: string,
  body?: unknown,
) => Promise<Value>

const browserHelpers = `
  const byText = (selector, text) => [...document.querySelectorAll(selector)]
    .find((element) => element.textContent.trim() === text)
  const guideAtStep = (index, total) => {
    const tooltip = document.querySelector('dialog[data-academy-tour-ui]')
    return tooltip?.querySelector('[aria-live="polite"]')?.textContent.trim() === index + ' / ' + total
      ? tooltip : null
  }
  const waitFor = (condition) => new Promise((resolve, reject) => {
    const observer = new MutationObserver(check)
    const timer = setTimeout(() => {
      observer.disconnect()
      reject(new Error('Academy UI did not reach the expected state: ' + JSON.stringify([...document.querySelectorAll('h1,h2,[role=alert]')].map((element) => element.textContent))))
    }, 5000)
    function check() {
      const value = condition()
      if (value) { observer.disconnect(); clearTimeout(timer); resolve(value) }
    }
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true })
    check()
  })
  const savedSnapshot = async () => {
    const database = await new Promise((resolve, reject) => {
      const request = indexedDB.open('tabbin-persistence-v2', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    try {
      const names = ['collectionCategories', 'collections', 'collectionGroups', 'collectionMemberships', 'urls']
      const transaction = database.transaction(names, 'readonly')
      return await Promise.all(names.map((name) => new Promise((resolve, reject) => {
        const request = transaction.objectStore(name).getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })))
    } finally { database.close() }
  }
`

/** Real extension DOM with the release smoke's isolated temporary XPI session. */
export const runFirefoxAcademyUiSmoke = async (
  command: Commands,
  origin: string,
) => {
  const evaluate = async <Value = unknown>(source: string): Promise<Value> => {
    const result = await command<{
      ok: boolean
      value: Value
      error?: { message: string }
    }>('/execute/async', {
      args: [],
      script: `
          const done = arguments[arguments.length - 1]
          ${browserHelpers}
          ;(async () => { ${source} })().then(
            (value) => done({ ok: true, value }),
            (error) => done({ ok: false, error: { message: error.message } }),
          )
        `,
    })
    assert.equal(
      result.ok,
      true,
      `${result.error?.message ?? ''}\nCheck: ${source}`,
    )
    return result.value
  }
  const navigate = async (route: string) => {
    await command('/url', { url: `${origin}/app.html#${route}` })
  }
  const press = async (value: string) => {
    await command('/actions', {
      actions: [
        {
          type: 'key',
          id: 'academy-keyboard',
          actions: [
            { type: 'keyDown', value },
            { type: 'keyUp', value },
          ],
        },
      ],
    })
  }
  const beforeTabs = await command('/window/handles')
  const beforeSaved = await evaluate('return savedSnapshot()')
  await evaluate(`
    const values = await browser.storage.local.get('userSettings')
    await browser.storage.local.set({
      userSettings: { ...values.userSettings, language: 'en' },
    })
  `)
  await navigate('/academy/domain-mode')
  const englishDirect = await evaluate<boolean>(`
    await waitFor(() => byText('main h1', 'Explore Domain mode'))
    return byText('[role="tab"]', 'Learn by video')?.disabled === false
      && byText('[role="tab"]', 'Practice with samples')?.disabled === true
      && !document.querySelector('video')
  `)
  assert.equal(englishDirect, true)
  await evaluate(`byText('[role="tab"]', 'Learn by video').focus()`)
  await press('\uE007')
  const videoPlayback = await evaluate<{
    duration: number
    rate: number
    paused: boolean
    captions: number
  }>(`
    const load = await waitFor(() => byText('button', 'Load video'))
    load.click()
    const video = await waitFor(() => document.querySelector('video'))
    const mediaEvent = (name, condition) => new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); video.removeEventListener(name, check) }
      const check = () => { if (condition()) { cleanup(); resolve() } }
      const timer = setTimeout(() => { cleanup(); reject(new Error('Video event missing: ' + name)) }, 5000)
      video.addEventListener(name, check)
      check()
    })
    await mediaEvent('loadeddata', () => video.readyState >= 2)
    video.muted = true
    video.playbackRate = 1.5
    await video.play()
    await mediaEvent('timeupdate', () => video.currentTime > 0)
    video.pause()
    const seek = mediaEvent('seeked', () => !video.seeking && Math.abs(video.currentTime - 5) < 0.1)
    video.currentTime = 5
    await seek
    return { duration: video.duration, rate: video.playbackRate, paused: video.paused, captions: video.textTracks.length }
  `)
  assert.equal(videoPlayback.duration, 30)
  assert.equal(videoPlayback.rate, 1.5)
  assert.equal(videoPlayback.paused, true)
  assert.equal(videoPlayback.captions, 2)
  await navigate('/saved-tabs?mode=domain&guide=domain-mode')
  const screenGuideViewedAt = await evaluate<number>(`
    await waitFor(() => guideAtStep(1, 3) && document.querySelector('[data-tour="academy-saved-url"]')?.getClientRects().length)
    byText('dialog[data-academy-tour-ui] button', 'Next').click()
    await waitFor(() => guideAtStep(2, 3) && document.querySelector('[data-tour="academy-view-mode"][data-mode="domain"]'))
    byText('dialog[data-academy-tour-ui] button', 'Next').click()
    await waitFor(() => guideAtStep(3, 3) && document.querySelector('[data-tour="academy-view-mode"][data-mode="custom"]'))
    byText('dialog[data-academy-tour-ui] button', 'Finish').click()
    await waitFor(() => byText('[data-academy-tour-ui] output', 'Screen guide viewed'))
    const values = await browser.storage.local.get('academyProgressV1')
    const progress = values.academyProgressV1.lessons['domain-mode']
    if (Object.keys(progress.practice).length !== 0) throw new Error('Screen guidance must not grant practice achievement')
    return progress.guideViewedAt
  `)
  assert.equal(Number.isFinite(screenGuideViewedAt), true)
  await navigate('/academy/domain-mode')
  const screenGuide = await evaluate<boolean>(`
    await waitFor(() => byText('main h1', 'Explore Domain mode') && document.querySelector('main')?.textContent.includes('Screen guide viewed'))
    const values = await browser.storage.local.get('academyProgressV1')
    const progress = values.academyProgressV1.lessons['domain-mode']
    return progress.guideViewedAt === ${JSON.stringify(screenGuideViewedAt)}
      && Object.keys(progress.practice).length === 0
      && document.querySelector('main').textContent.includes('Practice not completed')
  `)
  assert.equal(screenGuide, true)
  await navigate('/saved-tabs?mode=domain&guide=parent-categories')
  const parentGuideViewedAt = await evaluate<number>(`
    await waitFor(() => guideAtStep(1, 2) && document.querySelector('[data-tour="academy-parent-categories"]'))
    byText('dialog[data-academy-tour-ui] button', 'Next').click()
    await waitFor(() => guideAtStep(2, 2) && document.querySelector('[data-tour="academy-parent-dialog"] dialog[data-academy-tour-ui]'))
    byText('dialog[data-academy-tour-ui] button', 'Finish').click()
    await waitFor(() => !document.querySelector('[data-tour="academy-parent-dialog"]') && byText('[data-academy-tour-ui] output', 'Screen guide viewed'))
    const values = await browser.storage.local.get('academyProgressV1')
    const progress = values.academyProgressV1.lessons['parent-categories']
    if (Object.keys(progress.practice).length !== 0) throw new Error('Parent-category guidance must not grant practice achievement')
    return progress.guideViewedAt
  `)
  assert.equal(Number.isFinite(parentGuideViewedAt), true)
  await navigate('/academy/parent-categories')
  const parentGuide = await evaluate<boolean>(`
    await waitFor(() => byText('main h1', 'Organize parent categories') && document.querySelector('main')?.textContent.includes('Screen guide viewed'))
    const values = await browser.storage.local.get('academyProgressV1')
    const progress = values.academyProgressV1.lessons['parent-categories']
    return progress.guideViewedAt === ${JSON.stringify(parentGuideViewedAt)}
      && Object.keys(progress.practice).length === 0
      && document.querySelector('main').textContent.includes('Practice not completed')
  `)
  assert.equal(parentGuide, true)
  await command('/window/rect', { width: 390, height: 844 })
  await evaluate(`
    const values = await browser.storage.local.get('userSettings')
    await browser.storage.local.set({
      userSettings: { ...values.userSettings, language: 'ja' },
      'tab-manager-theme': 'dark',
    })
  `)
  await navigate('/academy')
  await command('/refresh', {})
  await evaluate(`
    const link = await waitFor(() => byText('main a', '拡張機能を固定'))
    link.focus()
  `)
  await press('\uE007')
  const japaneseKeyboard = await evaluate<boolean>(`
    await waitFor(() => byText('main h1', '拡張機能を固定'))
    return byText('[role="tab"]', '動画で学ぶ')?.disabled === false
      && !document.querySelector('video')
  `)
  assert.equal(japaneseKeyboard, true)
  const narrowDarkReducedMotion = await evaluate<boolean>(`
    return innerWidth < 600 && document.documentElement.scrollWidth <= innerWidth
      && document.documentElement.classList.contains('dark')
      && matchMedia('(prefers-reduced-motion: reduce)').matches
  `)
  assert.equal(narrowDarkReducedMotion, true)
  await navigate('/options')
  await evaluate(`
    const link = await waitFor(() => byText('a', 'TABBIN Academyを開く'))
    link.focus()
  `)
  await press('\uE007')
  const revisit = await evaluate<boolean>(`
    await waitFor(() => byText('main h1', '(preview)TABBIN Academy'))
    return !document.querySelector('[role="dialog"]')
  `)
  assert.equal(revisit, true)
  const domainPractice = await runFirefoxDomainPracticeSmoke(command, origin)
  assert.deepEqual(await evaluate('return savedSnapshot()'), beforeSaved)
  assert.deepEqual(await command('/window/handles'), beforeTabs)
  return {
    englishDirect,
    videoPlayback,
    japaneseKeyboard,
    narrowDarkReducedMotion,
    revisit,
    persistenceUnchanged: true,
    screenGuide,
    parentGuide,
    domainPractice,
  }
}
