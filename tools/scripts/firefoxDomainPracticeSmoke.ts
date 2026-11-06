import assert from 'node:assert/strict'

type Commands = <Value = unknown>(
  path: string,
  body?: unknown,
) => Promise<Value>

const elementKey = 'element-6066-11e4-a52e-4f735466cecf'
const enter = '\uE007'

const support = `
  const exact = (selector, text) => [...document.querySelectorAll(selector)]
    .find((node) => node.textContent.trim() === text)
  const until = (condition) => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      observer.disconnect()
      reject(new Error('Domain practice condition failed: ' + document.body.textContent.slice(0, 3000)))
    }, 5000)
    const inspect = () => {
      const result = condition()
      if (result) { clearTimeout(timeout); observer.disconnect(); resolve(result) }
    }
    const observer = new MutationObserver(inspect)
    observer.observe(document.documentElement, { subtree: true, attributes: true, childList: true, characterData: true })
    inspect()
  })
  const status = (step) => document.querySelector('[data-tour="academy-practice-status"]')?.dataset.step === step
  const eventually = async (read) => {
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      const value = await read()
      if (value) return value
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
    throw new Error('Domain practice progress did not reach its committed state')
  }
  const productionBoundary = async () => {
    const db = await new Promise((resolve, reject) => {
      const opening = indexedDB.open('tabbin-persistence-v2', 1)
      opening.onsuccess = () => resolve(opening.result)
      opening.onerror = () => reject(opening.error)
    })
    let saved
    try {
      const stores = ['collectionGroups', 'collections', 'collectionCategories', 'urls', 'collectionMemberships']
      const tx = db.transaction(stores, 'readonly')
      saved = await Promise.all(stores.map((store) => new Promise((resolve, reject) => {
        const request = tx.objectStore(store).getAll()
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })))
    } finally { db.close() }
    const settings = await browser.storage.local.get(null)
    delete settings.academyProgressV1
    return { saved, settings }
  }
`

const createFirefoxPracticeUi = (command: Commands, origin: string) => {
  const evaluate = async <Value = unknown>(source: string): Promise<Value> => {
    const result = await command<{
      ok: boolean
      value: Value
      reason?: string
    }>('/execute/async', {
      args: [],
      script: `
        const finish = arguments[arguments.length - 1]
        ${support}
        Promise.resolve().then(async () => { ${source} }).then(
          (value) => finish({ ok: true, value }),
          (error) => finish({ ok: false, reason: error.message }),
        )
      `,
    })
    assert.equal(result.ok, true, `${result.reason ?? ''}\nCheck: ${source}`)
    return result.value
  }
  const element = async (expression: string) => {
    const reference = await evaluate<Record<string, string>>(
      `return until(() => ${expression})`,
    )
    const id = reference[elementKey]
    assert.ok(id, `Missing WebDriver element: ${expression}`)
    return id
  }
  const click = async (selector: string) => {
    const id = await element(
      `document.querySelector(${JSON.stringify(selector)})`,
    )
    await command(`/element/${id}/click`, {})
  }
  const clickText = async (selector: string, text: string) => {
    const id = await element(
      `exact(${JSON.stringify(selector)}, ${JSON.stringify(text)})`,
    )
    await command(`/element/${id}/click`, {})
  }
  const press = async (value: string) => {
    await command('/actions', {
      actions: [
        {
          type: 'key',
          id: 'domain-practice-keyboard',
          actions: [
            { type: 'keyDown', value },
            { type: 'keyUp', value },
          ],
        },
      ],
    })
  }
  const fill = async (selector: string, text: string) => {
    const id = await element(
      `document.querySelector(${JSON.stringify(selector)})`,
    )
    // Native clear dispatches change/blur and can unmount a controlled rename
    // field before typing. Select its contents with the actual keyboard instead.
    await command(`/element/${id}/click`, {})
    const modifier = process.platform === 'darwin' ? '\uE03D' : '\uE009'
    await command('/actions', {
      actions: [
        {
          type: 'key',
          id: 'domain-practice-keyboard',
          actions: [
            { type: 'keyDown', value: modifier },
            { type: 'keyDown', value: 'a' },
            { type: 'keyUp', value: 'a' },
            { type: 'keyUp', value: modifier },
          ],
        },
      ],
    })
    const active = await element(
      `document.querySelector(${JSON.stringify(selector)})`,
    )
    await command(`/element/${active}/value`, { text })
  }
  const step = async (id: string) => {
    await evaluate(`await until(() => status(${JSON.stringify(id)}))`)
  }
  const nativeCalls: string[][] = []
  const guard = async () => {
    await evaluate(`
      const calls = []
      const root = document.documentElement
      const pageWindow = document.defaultView
      root.dataset.domainPracticeGuard = 'ready'
      root.dataset.domainPracticeNativeCalls = '[]'
      const record = (name) => {
        calls.push(name)
        root.dataset.domainPracticeNativeCalls = JSON.stringify(calls)
      }
      const replace = (owner, key, implementation) => {
        const original = owner[key]
        owner[key] = implementation(original.bind(owner))
      }
      const block = (name) => () => function blockedPracticeNativeAction() {
        record(name)
        throw new Error('Native operation from practice: ' + name)
      }
      for (const api of new Set([pageWindow.browser, pageWindow.chrome])) {
        for (const name of ['create', 'remove', 'update']) replace(api.tabs, name, block('tabs.' + name))
        replace(api.windows, 'create', block('windows.create'))
        replace(api.runtime, 'sendMessage', block('runtime.sendMessage'))
        replace(api.storage.local, 'set', (original) => (values) => {
          if (Object.keys(values).some((key) => key !== 'academyProgressV1')) {
            record('storage.local.set')
            throw new Error('Practice wrote production settings')
          }
          return original(values)
        })
        for (const name of ['remove', 'clear']) replace(api.storage.local, name, block('storage.local.' + name))
      }
      for (const name of ['open', 'deleteDatabase']) replace(pageWindow.indexedDB, name, block('indexedDB.' + name))
    `)
  }
  const finishPage = async () => {
    nativeCalls.push(
      await evaluate<string[]>(`
      if (document.documentElement.dataset.domainPracticeGuard !== 'ready' || document.defaultView.indexedDB.open.name !== 'blockedPracticeNativeAction') {
        throw new Error('Practice native API guards did not survive the WebDriver script boundary')
      }
      return JSON.parse(document.documentElement.dataset.domainPracticeNativeCalls)
    `),
    )
    assert.deepEqual(nativeCalls.at(-1), [])
  }
  const navigate = async (lessonId: string, language = 'en') => {
    await command('/url', {
      url: `${origin}/practice.html?lessonId=${lessonId}&lang=${language}`,
    })
    await evaluate(
      `await until(() => document.querySelector('[data-tour="academy-practice-status"]'))`,
    )
    await guard()
  }
  const completed = async (lessonId: string, count: number) => {
    await step('complete')
    const progress = await evaluate<number>(`
      return eventually(async () => {
        const value = await browser.storage.local.get('academyProgressV1')
        const count = Object.keys(value.academyProgressV1?.lessons[${JSON.stringify(lessonId)}]?.practice ?? {}).length
        return count === ${count} ? count : null
      })
    `)
    assert.equal(progress, count)
  }

  return {
    evaluate,
    click,
    clickText,
    press,
    fill,
    step,
    nativeCalls,
    finishPage,
    navigate,
    completed,
  }
}

/** Exercises the shipped React UI inside the temporary Firefox extension profile. */
export const runFirefoxDomainPracticeSmoke = async (
  command: Commands,
  origin: string,
) => {
  const {
    evaluate,
    click,
    clickText,
    press,
    fill,
    step,
    nativeCalls,
    finishPage,
    navigate,
    completed,
  } = createFirefoxPracticeUi(command, origin)
  const handles = await command('/window/handles')
  const baseline = await evaluate('return productionBoundary()')
  await command('/window/rect', { width: 1280, height: 900 })
  await navigate('parent-categories')
  await step('parent-categories-create')
  await click('[data-tour="academy-parent-categories"]')
  await fill('[data-tour="academy-parent-create"]', 'Firefox parent')
  await press(enter)
  await step('parent-categories-rename')
  await click('[data-tour="academy-parent-dialog"] [data-slot="dialog-close"]')
  await click(
    '[data-tour="academy-parent-group"] button[aria-label*="Manage parent categories"]',
  )
  await clickText(
    '[data-tour="academy-parent-manage"] button',
    'Demo workspace',
  )
  await fill('[data-tour="academy-parent-rename"]', 'Firefox workspace')
  await press(enter)
  await step('parent-categories-assign')
  await click('[data-tour="academy-parent-manage"] [data-slot="dialog-close"]')
  const assignNotes = async (parent: string) => {
    await click('[data-tour="academy-parent-categories"]')
    await click('[data-tour="academy-parent-dialog"] [role="combobox"]')
    await clickText('[role="option"]', parent)
    await clickText(
      '[data-tour="academy-domain-assignment"] label',
      'notes.academy.test',
    )
    await click(
      '[data-tour="academy-parent-dialog"] [data-slot="dialog-close"]',
    )
  }
  await assignNotes('Firefox parent')
  await step('parent-categories-success')
  await assignNotes('Demo learning')
  await completed('parent-categories', 4)
  await clickText(
    '[data-tour="academy-practice-lesson"] button',
    'Previous step',
  )
  await step('parent-categories-success')
  await assignNotes('Demo learning')
  await completed('parent-categories', 4)
  await clickText('header button', 'Reset practice')
  await step('parent-categories-create')
  await clickText('[data-tour="academy-practice-lesson"] button', 'Retry step')
  await step('parent-categories-create')
  await clickText(
    '[data-tour="academy-practice-lesson"] button',
    'Skip practice',
  )
  await evaluate(
    `await until(() => document.body.textContent.includes('Practice skipped.'))`,
  )
  await evaluate(`
    await eventually(async () => {
      const value = await browser.storage.local.get('academyProgressV1')
      return value.academyProgressV1?.lessons['parent-categories']?.skippedAt
    })
  `)
  await finishPage()

  await navigate('child-categories')
  await click('[data-tour="academy-child-categories"]')
  await fill('[data-tour="academy-child-create"]', 'Firefox child')
  await press(enter)
  await step('child-categories-rename')
  await click('[data-tour="academy-child-rename-action"]')
  await fill('[data-tour="academy-child-rename"]', 'Firefox renamed')
  await press(enter)
  await step('child-categories-keywords')
  await fill('[data-tour="academy-child-keywords"]', 'scratch')
  await press(enter)
  await step('child-categories-success')
  await click('[data-tour="academy-child-select"]')
  await clickText('[role="option"]', 'Guides')
  await fill('[data-tour="academy-child-keywords"]', 'notes')
  await press(enter)
  await completed('child-categories', 4)
  await finishPage()

  await navigate('reorder-items')
  const parentHandle =
    '[data-parent-id="practice-parent-0"] [data-tour="academy-parent-drag"]'
  const focusHandle = async (selector: string) => {
    await evaluate(`
      const handle = await until(() => document.querySelector(${JSON.stringify(selector)}))
      handle.scrollIntoView({ block: 'center' })
      handle.focus()
    `)
  }
  const activateDrag = async (selector: string) => {
    await focusHandle(selector)
    await press('\uE00D')
    await evaluate(`
      await until(() => document.querySelector(${JSON.stringify(selector)})?.getAttribute('aria-pressed') === 'true')
      await new Promise((resolve) => setTimeout(resolve, 0))
      await until(() => [...document.querySelectorAll('[role="status"][aria-live="assertive"]')].some((node) => node.textContent.includes(' is over ')))
    `)
  }
  const waitForRestoredFocus = async (selector: string) => {
    await evaluate(`
      const focused = () => {
        const handle = document.querySelector(${JSON.stringify(selector)})
        return handle && handle.getAttribute('aria-pressed') !== 'true' && document.activeElement === handle
      }
      // A completed parent drag removes aria-pressed instead of setting false.
      // Focus changes also do not notify MutationObserver, so poll this state.
      await eventually(focused)
      // dnd-kit restores focus in requestAnimationFrame after drop. Complete
      // that restoration before focusing the confirmation button.
      await new Promise((resolve) => requestAnimationFrame(resolve))
      await eventually(focused)
    `)
  }
  const moveKeyboard = async (selector: string, destination: string) => {
    await activateDrag(selector)
    await press('\uE015')
    await evaluate(`
      await until(() => [...document.querySelectorAll('[role="status"][aria-live="assertive"]')].some((node) => node.textContent.includes(${JSON.stringify(destination)})))
    `)
    await press('\uE00D')
    await waitForRestoredFocus(selector)
  }
  const confirmOrder = async () => {
    const selector = 'button[aria-label="Confirm parent category reordering"]'
    await focusHandle(selector)
    await press(enter)
    await evaluate(
      `await until(() => !document.querySelector(${JSON.stringify(selector)}))`,
    )
  }
  await activateDrag(parentHandle)
  await press('\uE015')
  await press('\uE00C')
  await waitForRestoredFocus(parentHandle)
  await step('reorder-items-parents')
  await moveKeyboard(parentHandle, 'Demo learning')
  await step('reorder-items-parents')
  await confirmOrder()
  await step('reorder-items-domains')
  const notes = '[data-domain-id="practice-domain-0"]'
  await moveKeyboard(
    `${notes} [data-tour="academy-domain-drag"]`,
    'learn.academy.test',
  )
  await step('reorder-items-domains')
  await confirmOrder()
  await step('reorder-items-success')
  await moveKeyboard(
    `${notes} [data-tour="academy-child-drag"][aria-label='Drag to reorder category "Guides"']`,
    'References',
  )
  await step('reorder-items-success')
  await confirmOrder()
  await completed('reorder-items', 3)
  await finishPage()

  await navigate('restore-tabs')
  await click('[data-tour="academy-restore-tabs"]')
  await completed('restore-tabs', 1)
  const simulated = await evaluate<boolean>(`
    return document.querySelector('header output')?.textContent.match(/[1-9]/) !== null
  `)
  assert.equal(simulated, true)
  await finishPage()

  await command('/window/rect', { width: 390, height: 844 })
  await navigate('parent-categories', 'ja')
  await evaluate(`exact('header button', '練習をリセット').focus()`)
  await press(enter)
  await step('parent-categories-create')
  const japaneseNarrow = await evaluate<boolean>(`
    return document.documentElement.lang === 'ja' && innerWidth < 600
      && document.documentElement.scrollWidth <= innerWidth
      && matchMedia('(prefers-reduced-motion: reduce)').matches
      && document.body.textContent.includes('練習の手順')
  `)
  assert.equal(japaneseNarrow, true)
  await finishPage()
  await command('/url', {
    url: `${origin}/practice.html?lessonId=domain-mode&lang=en`,
  })
  await evaluate(`await until(() => document.querySelector('main h1'))`)
  assert.deepEqual(await evaluate('return productionBoundary()'), baseline)
  assert.deepEqual(await command('/window/handles'), handles)
  return {
    parentComplete: true,
    childComplete: true,
    reorderComplete: true,
    restoreSimulated: true,
    rewindResetSkip: true,
    japaneseNarrow,
    nativeCalls: nativeCalls.flat().length,
    persistenceUnchanged: true,
    tabsUnchanged: true,
  }
}
