import { describe, expect, it } from 'vitest'

import {
  assertFirefoxSourceContract,
  collectFirefoxSourceContractViolations,
} from './firefoxSourceContract.ts'

describe('collectFirefoxSourceContractViolations - chrome-extension:// literal', () => {
  it('reports a chrome-extension:// literal in production source', () => {
    const source = `const origin = 'chrome-extension://id'
`
    const violations = collectFirefoxSourceContractViolations({
      source,
      filePath: 'src/lib/somemodule/origin.ts',
    })

    expect(violations).toContainEqual({
      category: 'chrome-extension-literal',
      path: 'src/lib/somemodule/origin.ts',
      line: 1,
      column: 17,
      reason: expect.stringContaining('chrome-extension://'),
    })
  })

  it('skips chrome-extension:// literals in test files', () => {
    const source = `const a = 'chrome-extension://'
`
    const violations = collectFirefoxSourceContractViolations({
      source,
      filePath: 'src/lib/background/ai-chat.test.ts',
    })

    expect(violations).toEqual([])
  })

  it('skips chrome-extension:// literals in storybook files', () => {
    const source = `export const Foo = { args: { url: 'chrome-extension://' } }
`
    const violations = collectFirefoxSourceContractViolations({
      source,
      filePath: 'src/components/Foo.stories.ts',
    })

    expect(violations).toEqual([])
  })

  it('skips chrome-extension:// literals in src/test/ support files', () => {
    const source = `export const X = 'chrome-extension://'
`
    const violations = collectFirefoxSourceContractViolations({
      source,
      filePath: 'src/test/fixtures.ts',
    })

    expect(violations).toEqual([])
  })

  it('suppresses chrome-extension:// literals in KNOWN_CHROME_EXTENSION_LITERAL_DEBT paths', () => {
    const source = `const fallback = \`chrome-extension://\${id}\`
const other = 'chrome-extension://*'
`
    const violations = collectFirefoxSourceContractViolations({
      source,
      filePath: 'src/lib/background/ai-chat.ts',
    })

    expect(violations).toEqual([])
  })

  it('reports multiple chrome-extension:// literals on different lines', () => {
    const source = `const a = 'chrome-extension://id-a'
const b = 'chrome-extension://id-b'
`
    const violations = collectFirefoxSourceContractViolations({
      source,
      filePath: 'src/some/file.ts',
    })

    expect(violations).toHaveLength(2)
    expect(violations[0].line).toBe(1)
    expect(violations[1].line).toBe(2)
  })

  it('reports the correct 1-indexed column for the literal', () => {
    const source = `const padding = '   chrome-extension://id'
`
    const violations = collectFirefoxSourceContractViolations({
      source,
      filePath: 'src/some/file.ts',
    })

    expect(violations[0].column).toBe(21)
  })
})

describe('collectFirefoxSourceContractViolations - chrome-only API', () => {
  it('reports chrome.debugger usage in production source', () => {
    const source = `const target = await chrome.debugger.attach({ targetId }, 1)
`
    const violations = collectFirefoxSourceContractViolations({
      source,
      filePath: 'src/some/file.ts',
    })

    expect(violations).toContainEqual({
      category: 'chrome-only-api',
      path: 'src/some/file.ts',
      line: 1,
      column: 22,
      reason: 'chrome.debugger is Chrome-only and not available on Firefox',
    })
  })

  it('reports chrome.gcm usage', () => {
    const source = `chrome.gcm.register(['id'])
`
    const violations = collectFirefoxSourceContractViolations({
      source,
      filePath: 'src/some/file.ts',
    })

    expect(violations).toContainEqual({
      category: 'chrome-only-api',
      path: 'src/some/file.ts',
      line: 1,
      column: 1,
      reason: 'chrome.gcm is Chrome-only and not available on Firefox',
    })
  })

  it('reports chrome.system.display usage with dotted API name', () => {
    const source = `const info = chrome.system.display.getInfo()
`
    const violations = collectFirefoxSourceContractViolations({
      source,
      filePath: 'src/some/file.ts',
    })

    expect(violations).toContainEqual({
      category: 'chrome-only-api',
      path: 'src/some/file.ts',
      line: 1,
      column: 14,
      reason:
        'chrome.system.display is Chrome-only and not available on Firefox',
    })
  })

  it('does not report chrome.tabs which Firefox supports through the polyfill', () => {
    const source = `const tabs = await chrome.tabs.query({})
`
    const violations = collectFirefoxSourceContractViolations({
      source,
      filePath: 'src/some/file.ts',
    })

    expect(violations).toEqual([])
  })

  it('does not report chrome.runtime which Firefox supports through the polyfill', () => {
    const source = `const id = chrome.runtime.id`
    const violations = collectFirefoxSourceContractViolations({
      source,
      filePath: 'src/some/file.ts',
    })

    expect(violations).toEqual([])
  })

  it('skips chrome-only API usage in test files', () => {
    const source = `chrome.debugger.attach({})
`
    const violations = collectFirefoxSourceContractViolations({
      source,
      filePath: 'src/some/file.test.ts',
    })

    expect(violations).toEqual([])
  })

  it('reports multiple chrome-only APIs on the same line', () => {
    const source = `chrome.debugger.attach({}); chrome.gcm.register([])
`
    const violations = collectFirefoxSourceContractViolations({
      source,
      filePath: 'src/some/file.ts',
    })

    expect(violations).toHaveLength(2)
  })
})

describe('assertFirefoxSourceContract', () => {
  it('does not throw when there are no violations', () => {
    expect(() =>
      assertFirefoxSourceContract({
        source: `const id = chrome.runtime.id`,
        filePath: 'src/safe/file.ts',
      }),
    ).not.toThrow()
  })

  it('throws an aggregated error describing every violation', () => {
    expect(() =>
      assertFirefoxSourceContract({
        source: `chrome.debugger.attach({})
const origin = 'chrome-extension://id'`,
        filePath: 'src/some/file.ts',
      }),
    ).toThrow(/Firefox source contract violations/)
  })
})
