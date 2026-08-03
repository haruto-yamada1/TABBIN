export type FirefoxSourceViolation = {
  readonly category: 'chrome-extension-literal' | 'chrome-only-api'
  readonly path: string
  readonly line: number
  readonly column: number
  readonly reason: string
}

// Production source files that still inline `chrome-extension://` literals as
// part of runtime/UI behaviour. Each entry is tracked as Phase 3+ follow-up
// (see docs/testing/firefox-smoke.md). New additions are blocked by the
// verifier - extend this list only when explicitly retrofitting Firefox support
// to the listed file in the same change.
const KNOWN_CHROME_EXTENSION_LITERAL_DEBT: readonly string[] = [
  // ai-chat/background fallback builds the origin from chrome.runtime.id when
  // chrome.runtime.getURL('') throws. The fallback should derive the scheme
  // from the runtime URL instead of assuming chrome-extension://.
  'src/lib/background/ai-chat.ts',
  // OllamaErrorNotice default origin surfaced to users when no error payload
  // is available. Should display a browser-agnostic origin derived from the
  // runtime instead of a chrome-extension:// literal.
  'src/features/ai-chat/components/OllamaErrorNotice.tsx',
  // Default excludePatterns seeded into user settings. The literal is an
  // illustrative browser-internal page pattern; Phase 3+ should add a
  // moz-extension:// sibling so Firefox users see the same exclusion coverage.
  'src/contexts/saved-tabs/domain/services/userSettingsDefaultsMerge.ts',
  // i18n message placeholder shown next to the exclude patterns input as an
  // example of what to exclude. The text is illustrative, not a runtime URL.
  'src/features/i18n/messages.ts',
  // Property-based corpus example URLs use the chrome-extension:// scheme as a
  // representative browser-internal page. The corpus expresses normalization
  // rules, not a runtime URL contract.
  'src/contexts/saved-tabs/domain/services/urlIdentityCorpus.ts',
]

// chrome.* APIs Firefox does not support (undefined on browser.* polyfill and
// rejected at AMO review). Mirrors the manifest permission blocklist in
// firefoxArtifactContract.ts so both manifest declarations and source usage
// are caught at the same boundary.
const CHROME_ONLY_API_NAMES = new Set([
  'debugger',
  'gcm',
  'system.display',
  'platformKeys',
  'printerProvider',
  'fileBrowserHandler',
  'input',
  'ttsengine',
  'tabCapture',
  'pageCapture',
  'identity',
  'vpnProvider',
  'enterprise',
])

const isAllowedLiteralPath = (
  filePath: string,
  allowlist: readonly string[],
): boolean => allowlist.includes(filePath)

const isTestOrStorybookFile = (filePath: string): boolean =>
  /\.(test|spec)\.(ts|tsx)$/.test(filePath) ||
  /\.stories\.(ts|tsx)$/.test(filePath) ||
  filePath.includes('/test/') ||
  filePath.includes('\\test\\') ||
  filePath.includes('/storybook/') ||
  filePath.includes('\\storybook\\')

const collectChromeExtensionLiteralViolations = (
  source: string,
  filePath: string,
): FirefoxSourceViolation[] => {
  if (isTestOrStorybookFile(filePath)) {
    return []
  }
  const violations: FirefoxSourceViolation[] = []
  const lines = source.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.includes('chrome-extension://')) {
      continue
    }
    const column = line.indexOf('chrome-extension://') + 1
    violations.push({
      category: 'chrome-extension-literal',
      path: filePath,
      line: index + 1,
      column,
      reason:
        'hardcoded chrome-extension:// literal is not portable to Firefox (moz-extension://); acknowledge as debt in KNOWN_CHROME_EXTENSION_LITERAL_DEBT or derive the scheme from runtime.getURL',
    })
  }
  return violations
}

const collectChromeOnlyApiViolations = (
  source: string,
  filePath: string,
): FirefoxSourceViolation[] => {
  if (isTestOrStorybookFile(filePath)) {
    return []
  }
  const violations: FirefoxSourceViolation[] = []
  const lines = source.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    for (const api of CHROME_ONLY_API_NAMES) {
      const needle = `chrome.${api}`
      let from = 0
      let column = line.indexOf(needle, from)
      while (column !== -1) {
        violations.push({
          category: 'chrome-only-api',
          path: filePath,
          line: index + 1,
          column: column + 1,
          reason: `chrome.${api} is Chrome-only and not available on Firefox`,
        })
        from = column + needle.length
        column = line.indexOf(needle, from)
      }
    }
  }
  return violations
}

export const collectFirefoxSourceContractViolations = (params: {
  readonly source: string
  readonly filePath: string
}): readonly FirefoxSourceViolation[] => {
  const { source, filePath } = params
  const literalViolations = collectChromeExtensionLiteralViolations(
    source,
    filePath,
  ).filter(
    (violation) =>
      !isAllowedLiteralPath(
        violation.path,
        KNOWN_CHROME_EXTENSION_LITERAL_DEBT,
      ),
  )
  const apiViolations = collectChromeOnlyApiViolations(source, filePath)
  return [...literalViolations, ...apiViolations]
}

export const assertFirefoxSourceContract = (params: {
  readonly source: string
  readonly filePath: string
}): void => {
  const violations = collectFirefoxSourceContractViolations(params)
  if (violations.length === 0) {
    return
  }
  const detail = violations
    .map(
      (violation) =>
        `  - [${violation.category}] ${violation.path}:${violation.line}:${violation.column} ${violation.reason}`,
    )
    .join('\n')
  throw new Error(
    `Firefox source contract violations (${violations.length}):\n${detail}`,
  )
}
