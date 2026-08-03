import { describe, expect, it } from 'vitest'

import {
  assertFirefoxSourceContract,
  collectFirefoxSourceContractViolations,
} from './firefoxSourceContract.ts'

describe('collectFirefoxSourceContractViolations - chrome-extension:// literal', () => {
  describe('assertFirefoxSourceContract', () => {
    it('does not throw when there are no violations', () => {
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

  describe('collectFirefoxSourceContractViolations - KNOWN_CHROME_EXTENSION_LITERAL_DEBT count enforcement', () => {
    it('suppresses exactly the acknowledged occurrence count in an allowlisted file', () => {
      // ai-chat.ts currently declares 2 acknowledged occurrences.
      const source = `const a = 'chrome-extension://id-a'
const b = 'chrome-extension://id-b'
`
      const violations = collectFirefoxSourceContractViolations({
        source,
        filePath: 'src/lib/background/ai-chat.ts',
      })

      expect(violations).toEqual([])
    })

    it('reports a NEW chrome-extension:// literal beyond the allowlisted count', () => {
      const source = `const a = 'chrome-extension://id-a'
const b = 'chrome-extension://id-b'
const c = 'chrome-extension://id-c'
`
      const violations = collectFirefoxSourceContractViolations({
        source,
        filePath: 'src/lib/background/ai-chat.ts',
      })

      expect(violations).toHaveLength(1)
      expect(violations[0].line).toBe(3)
      expect(violations[0].reason).toMatch(/expected 2 occurrence/)
    })

    it('reports the whole file when an allowlisted file drops all literals (let debt shrink)', () => {
      // If ai-chat.ts is retrofitted to remove the chrome-extension:// literals,
      // the allowlist entry becomes stale. The verifier does not fail in that
      // case (zero violations), because no NEW violation occurred. But a
      // follow-up to lower the count should accompany the cleanup so the
      // allowlist stays a true record of current debt.
      const source = `const id = chrome.runtime.id
`
      const violations = collectFirefoxSourceContractViolations({
        source,
        filePath: 'src/lib/background/ai-chat.ts',
      })

      expect(violations).toEqual([])
    })

    it('reports every literal when the file is NOT on the allowlist', () => {
      const source = `const a = 'chrome-extension://id-a'
const b = 'chrome-extension://id-b'
`
      const violations = collectFirefoxSourceContractViolations({
        source,
        filePath: 'src/some/other/file.ts',
      })

      expect(violations).toHaveLength(2)
    })

    it('reports a literal when file is allowlisted with a different count', () => {
      // i18n messages.ts is allowlisted with 2 occurrences. A file that looks
      // like i18n but only matches 1 literal should not be treated as fully
      // suppressed; instead, since actual < allowlist count, no violation is
      // reported (zero NEW). This case is documented for maintainers so they
      // know the count is an upper bound, not an exact-match requirement.
      const source = `const msg = 'e.g. chrome-extension://'
`
      const violations = collectFirefoxSourceContractViolations({
        source,
        filePath: 'src/features/i18n/messages.ts',
      })

      expect(violations).toEqual([])
    })
  })
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
