import { runInNewContext } from 'node:vm'

import { describe, expect, it, vi } from 'vitest'

import { createFirefoxPracticeUi } from './firefoxDomainPracticeSmoke'

type Execution = { args: unknown[]; script: string }

const createSession = (text = '', lessonId = '', count = 0) => {
  const executions: Execution[] = []
  const element = { 'element-6066-11e4-a52e-4f735466cecf': 'practice-element' }
  const querySelector = vi.fn(() => ({
    ...element,
    dataset: { step: 'complete' },
  }))
  const querySelectorAll = vi.fn(() => [{ ...element, textContent: text }])
  const context = {
    injected: false,
    document: { querySelector, querySelectorAll, documentElement: {} },
    browser: {
      storage: {
        local: {
          get: async () => ({
            academyProgressV1: {
              lessons: {
                [lessonId]: {
                  practice: Object.fromEntries(
                    Array.from({ length: count }, (_, index) => [index, true]),
                  ),
                },
              },
            },
          }),
        },
      },
    },
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    setTimeout,
    clearTimeout,
  }
  const command = vi.fn(async (path: string, body?: unknown) => {
    if (path !== '/execute/async') {
      return undefined
    }
    const execution = body as Execution
    executions.push(execution)
    return new Promise((resolve) => {
      // Execute the WebDriver function body with data arguments and its final
      // callback, matching the native async endpoint's calling convention.
      const execute = runInNewContext(
        `(function () { ${execution.script}\n })`,
        context,
      ) as (...args: unknown[]) => void
      execute(...execution.args, resolve)
    })
  })
  const ui = createFirefoxPracticeUi(
    command as Parameters<typeof createFirefoxPracticeUi>[0],
    'moz-extension://practice',
  )
  return { ui, executions, querySelector, querySelectorAll, command, context }
}

describe('Firefox domain practice WebDriver argument boundary', () => {
  it.each([
    `quote ' " and \\`,
    '</script><script>globalThis.injected = true</script>',
    '"); globalThis.injected = true; //',
    'line\u2028paragraph\u2029nul\0日本語 😀',
  ])('keeps selector and text as data: %s', async (value) => {
    const { ui, executions, querySelectorAll, context } = createSession(value)
    await ui.clickText(value, value)

    expect(executions[0]?.args).toEqual([value, value])
    expect(executions[0]?.script).not.toContain(value)
    expect(querySelectorAll).toHaveBeenCalledWith(value)
    expect(context.injected).toBe(false)
  })

  it('keeps selectors outside script source during native click and fill', async () => {
    const selector = '[data-name="</script>日本語"]'
    const text = 'typed "; globalThis.injected = true; //'
    const { ui, executions, querySelector, command, context } = createSession()

    await ui.click(selector)
    await ui.fill(selector, text)

    expect(executions.map(({ args }) => args)).toEqual([
      [selector],
      [selector],
      [selector],
    ])
    expect(querySelector.mock.calls.flat()).toEqual([
      selector,
      selector,
      selector,
    ])
    expect(command).toHaveBeenCalledWith('/element/practice-element/value', {
      text,
    })
    expect(context.injected).toBe(false)
  })

  it('keeps lesson IDs and expected counts as data while reading committed progress', async () => {
    const lessonId = '</script>"\u2028日本語'
    const { ui, executions, context } = createSession('', lessonId, 2)

    await ui.completed(lessonId, 2)

    expect(executions.map(({ args }) => args)).toEqual([
      ['complete'],
      [lessonId, 2],
    ])
    expect(executions[1]?.script).not.toContain(lessonId)
    expect(context.injected).toBe(false)
  })
})
