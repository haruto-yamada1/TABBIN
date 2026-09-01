import { describe, expect, it } from 'vitest'

import {
  assertFirefoxArtifactContract,
  collectFirefoxArtifactContractViolations,
} from './firefoxArtifactContract.ts'

const createFileExists =
  (present: ReadonlySet<string>): ((relativePath: string) => boolean) =>
  (relativePath: string) =>
    present.has(relativePath)

const createCompliantManifest = (): Record<string, unknown> => ({
  manifest_version: 2,
  name: '__MSG_extensionName__',
  description: '__MSG_extensionDescription__',
  version: '2.0.16',
  default_locale: 'ja',
  icons: {
    '16': 'icon/16.png',
    '32': 'icon/32.png',
    '48': 'icon/48.png',
    '96': 'icon/96.png',
    '128': 'icon/128.png',
  },
  incognito: 'not_allowed',
  content_security_policy: "default-src 'self'",
  permissions: ['alarms', 'tabs', 'storage'],
  options_ui: { open_in_tab: true, page: 'options.html' },
  browser_specific_settings: {
    gecko: { data_collection_permissions: { required: ['none'] } },
  },
  background: { scripts: ['background.js'] },
  browser_action: { default_title: '__MSG_extensionName__' },
})

const createCompliantArtifacts = (): ReadonlySet<string> =>
  new Set([
    'background.js',
    'options.html',
    'icon/16.png',
    'icon/32.png',
    'icon/48.png',
    'icon/96.png',
    'icon/128.png',
    '_locales/ja/messages.json',
    '_locales/en/messages.json',
  ])

describe('collectFirefoxArtifactContractViolations', () => {
  it('accepts a contract-compliant Firefox manifest with all required artifacts present', () => {
    const violations = collectFirefoxArtifactContractViolations({
      manifest: createCompliantManifest(),
      fileExists: createFileExists(createCompliantArtifacts()),
      label: 'firefox-mv2',
    })

    expect(violations).toEqual([])
  })

  it('rejects a manifest that is not an object', () => {
    const violations = collectFirefoxArtifactContractViolations({
      manifest: 'not-an-object',
      fileExists: createFileExists(createCompliantArtifacts()),
      label: 'firefox-mv2',
    })

    expect(violations).toContainEqual({
      category: 'manifest',
      path: 'firefox-mv2',
      reason: 'manifest must be an object',
    })
  })

  it('rejects a manifest_version other than 2', () => {
    const manifest = createCompliantManifest()
    manifest.manifest_version = 3

    const violations = collectFirefoxArtifactContractViolations({
      manifest,
      fileExists: createFileExists(createCompliantArtifacts()),
      label: 'firefox-mv2',
    })

    expect(violations).toContainEqual({
      category: 'manifest',
      path: 'firefox-mv2',
      reason: 'manifest_version must be 2 for Firefox artifact',
    })
  })

  it('rejects a missing content_security_policy', () => {
    const manifest = createCompliantManifest()
    delete manifest.content_security_policy

    const violations = collectFirefoxArtifactContractViolations({
      manifest,
      fileExists: createFileExists(createCompliantArtifacts()),
      label: 'firefox-mv2',
    })

    expect(violations).toContainEqual({
      category: 'manifest',
      path: 'firefox-mv2.content_security_policy',
      reason:
        'Firefox MV2 content_security_policy must be a string (MV3 object form is rejected)',
    })
  })

  it('rejects content_security_policy in MV3 object form', () => {
    const manifest = createCompliantManifest()
    manifest.content_security_policy = {
      extension_pages: "default-src 'self'",
    }

    const violations = collectFirefoxArtifactContractViolations({
      manifest,
      fileExists: createFileExists(createCompliantArtifacts()),
      label: 'firefox-mv2',
    })

    expect(violations).toContainEqual({
      category: 'manifest',
      path: 'firefox-mv2.content_security_policy',
      reason:
        'Firefox MV2 content_security_policy must be a string (MV3 object form is rejected)',
    })
  })

  it('rejects default_locale other than ja', () => {
    const manifest = createCompliantManifest()
    manifest.default_locale = 'en'

    const violations = collectFirefoxArtifactContractViolations({
      manifest,
      fileExists: createFileExists(createCompliantArtifacts()),
      label: 'firefox-mv2',
    })

    expect(violations).toContainEqual({
      category: 'manifest',
      path: 'firefox-mv2.default_locale',
      reason: "default_locale must be 'ja'; found 'en'",
    })
  })

  it('rejects a missing default_locale', () => {
    const manifest = createCompliantManifest()
    delete manifest.default_locale

    const violations = collectFirefoxArtifactContractViolations({
      manifest,
      fileExists: createFileExists(createCompliantArtifacts()),
      label: 'firefox-mv2',
    })

    expect(violations).toContainEqual({
      category: 'manifest',
      path: 'firefox-mv2.default_locale',
      reason: "default_locale must be 'ja'; found undefined",
    })
  })

  it('rejects a missing options_ui.page', () => {
    const manifest = createCompliantManifest()
    delete manifest.options_ui

    const violations = collectFirefoxArtifactContractViolations({
      manifest,
      fileExists: createFileExists(createCompliantArtifacts()),
      label: 'firefox-mv2',
    })

    expect(violations).toContainEqual({
      category: 'manifest',
      path: 'firefox-mv2.options_ui',
      reason: "options_ui.page must be 'options.html'",
    })
  })

  it('rejects options_ui.page other than options.html', () => {
    const manifest = createCompliantManifest()
    manifest.options_ui = { open_in_tab: true, page: 'settings.html' }

    const violations = collectFirefoxArtifactContractViolations({
      manifest,
      fileExists: createFileExists(createCompliantArtifacts()),
      label: 'firefox-mv2',
    })

    expect(violations).toContainEqual({
      category: 'manifest',
      path: 'firefox-mv2.options_ui',
      reason: "options_ui.page must be 'options.html'",
    })
  })

  it('rejects a missing icons block', () => {
    const manifest = createCompliantManifest()
    delete manifest.icons

    const violations = collectFirefoxArtifactContractViolations({
      manifest,
      fileExists: createFileExists(createCompliantArtifacts()),
      label: 'firefox-mv2',
    })

    expect(violations).toContainEqual({
      category: 'manifest',
      path: 'firefox-mv2.icons',
      reason:
        'Firefox artifact must declare the required icon sizes 16, 32, 48, 96, 128',
    })
  })

  it('rejects icons that are missing required sizes', () => {
    const manifest = createCompliantManifest()
    manifest.icons = {
      '16': 'icon/16.png',
      '32': 'icon/32.png',
      '48': 'icon/48.png',
      '128': 'icon/128.png',
    }

    const violations = collectFirefoxArtifactContractViolations({
      manifest,
      fileExists: createFileExists(createCompliantArtifacts()),
      label: 'firefox-mv2',
    })

    expect(violations).toContainEqual({
      category: 'manifest',
      path: 'firefox-mv2.icons',
      reason:
        'Firefox artifact must declare the required icon sizes 16, 32, 48, 96, 128',
    })
  })

  it('rejects Chrome-only API permissions in the manifest', () => {
    const manifest = createCompliantManifest()
    manifest.permissions = ['alarms', 'debugger', 'tabs', 'gcm']

    const violations = collectFirefoxArtifactContractViolations({
      manifest,
      fileExists: createFileExists(createCompliantArtifacts()),
      label: 'firefox-mv2',
    })

    expect(violations).toContainEqual({
      category: 'manifest',
      path: 'firefox-mv2.permissions',
      reason: 'Chrome-only API permission detected: debugger',
    })
    expect(violations).toContainEqual({
      category: 'manifest',
      path: 'firefox-mv2.permissions',
      reason: 'Chrome-only API permission detected: gcm',
    })
  })

  it('rejects missing browser_specific_settings', () => {
    const manifest = createCompliantManifest()
    delete manifest.browser_specific_settings

    const violations = collectFirefoxArtifactContractViolations({
      manifest,
      fileExists: createFileExists(createCompliantArtifacts()),
      label: 'firefox-mv2',
    })

    expect(violations).toContainEqual({
      category: 'manifest',
      path: 'firefox-mv2.browser_specific_settings',
      reason:
        'Firefox artifact must declare browser_specific_settings.gecko.data_collection_permissions.required equal to ["none"]',
    })
  })

  it('rejects browser_specific_settings that does not match the required data_collection_permissions', () => {
    const manifest = createCompliantManifest()
    manifest.browser_specific_settings = {
      gecko: { id: 'tabbin@example.com' },
    }

    const violations = collectFirefoxArtifactContractViolations({
      manifest,
      fileExists: createFileExists(createCompliantArtifacts()),
      label: 'firefox-mv2',
    })

    expect(violations).toContainEqual({
      category: 'manifest',
      path: 'firefox-mv2.browser_specific_settings',
      reason:
        'Firefox artifact must declare browser_specific_settings.gecko.data_collection_permissions.required equal to ["none"]',
    })
  })

  it('rejects missing background.scripts', () => {
    const manifest = createCompliantManifest()
    delete manifest.background

    const violations = collectFirefoxArtifactContractViolations({
      manifest,
      fileExists: createFileExists(createCompliantArtifacts()),
      label: 'firefox-mv2',
    })

    expect(violations).toContainEqual({
      category: 'manifest',
      path: 'firefox-mv2.background',
      reason:
        'Firefox artifact must declare background.scripts as a non-empty string array',
    })
  })

  it('rejects an empty background.scripts array', () => {
    const manifest = createCompliantManifest()
    manifest.background = { scripts: [] }

    const violations = collectFirefoxArtifactContractViolations({
      manifest,
      fileExists: createFileExists(createCompliantArtifacts()),
      label: 'firefox-mv2',
    })

    expect(violations).toContainEqual({
      category: 'manifest',
      path: 'firefox-mv2.background',
      reason:
        'Firefox artifact must declare background.scripts as a non-empty string array',
    })
  })

  it('rejects when the declared background script is not present in the artifact', () => {
    const violations = collectFirefoxArtifactContractViolations({
      manifest: createCompliantManifest(),
      fileExists: createFileExists(
        new Set(
          [...createCompliantArtifacts()].filter((p) => p !== 'background.js'),
        ),
      ),
      label: 'firefox-mv2',
    })

    expect(violations).toContainEqual({
      category: 'artifact',
      path: 'firefox-mv2/background.js',
      reason: 'declared background script missing in artifact',
    })
  })

  it('rejects when options.html is not present in the artifact', () => {
    const violations = collectFirefoxArtifactContractViolations({
      manifest: createCompliantManifest(),
      fileExists: createFileExists(
        new Set(
          [...createCompliantArtifacts()].filter((p) => p !== 'options.html'),
        ),
      ),
      label: 'firefox-mv2',
    })

    expect(violations).toContainEqual({
      category: 'artifact',
      path: 'firefox-mv2/options.html',
      reason: 'declared options_ui page missing in artifact',
    })
  })

  it('rejects when a declared icon file is not present in the artifact', () => {
    const violations = collectFirefoxArtifactContractViolations({
      manifest: createCompliantManifest(),
      fileExists: createFileExists(
        new Set(
          [...createCompliantArtifacts()].filter((p) => p !== 'icon/96.png'),
        ),
      ),
      label: 'firefox-mv2',
    })

    expect(violations).toContainEqual({
      category: 'artifact',
      path: 'firefox-mv2/icon/96.png',
      reason: 'declared icon file missing in artifact',
    })
  })

  it('rejects when the default locale messages.json is not present in the artifact', () => {
    const violations = collectFirefoxArtifactContractViolations({
      manifest: createCompliantManifest(),
      fileExists: createFileExists(
        new Set(
          [...createCompliantArtifacts()].filter(
            (p) => p !== '_locales/ja/messages.json',
          ),
        ),
      ),
      label: 'firefox-mv2',
    })

    expect(violations).toContainEqual({
      category: 'artifact',
      path: 'firefox-mv2/_locales/ja/messages.json',
      reason: 'default locale messages.json missing in artifact',
    })
  })

  it('rejects when the fallback en locale messages.json is not present in the artifact', () => {
    const violations = collectFirefoxArtifactContractViolations({
      manifest: createCompliantManifest(),
      fileExists: createFileExists(
        new Set(
          [...createCompliantArtifacts()].filter(
            (p) => p !== '_locales/en/messages.json',
          ),
        ),
      ),
      label: 'firefox-mv2',
    })

    expect(violations).toContainEqual({
      category: 'artifact',
      path: 'firefox-mv2/_locales/en/messages.json',
      reason: 'fallback locale messages.json missing in artifact',
    })
  })

  it('returns multiple violations together when several contracts break at once', () => {
    const manifest = createCompliantManifest()
    manifest.manifest_version = 3
    manifest.default_locale = 'de'
    manifest.options_ui = { open_in_tab: true, page: 'settings.html' }

    const violations = collectFirefoxArtifactContractViolations({
      manifest,
      fileExists: createFileExists(new Set()),
      label: 'firefox-mv2',
    })

    expect(violations.length).toBeGreaterThanOrEqual(3)
  })

  it('does not crash when icons declares only some required sizes (no undefined reaches fileExists)', () => {
    const manifest = createCompliantManifest()
    manifest.icons = {
      '16': 'icon/16.png',
      '32': 'icon/32.png',
    }

    const throwingFileExists = (relativePath: string): boolean => {
      if (typeof relativePath !== 'string') {
        throw new TypeError(
          `fileExists received a non-string path: ${String(relativePath)}`,
        )
      }
      return createFileExists(createCompliantArtifacts())(relativePath)
    }

    const violations = collectFirefoxArtifactContractViolations({
      manifest,
      fileExists: throwingFileExists,
      label: 'firefox-mv2',
    })

    // The missing sizes 48/96/128 are reported as a single manifest violation
    // by the icons-size contract, and the artifact loop must not invoke
    // fileExists with undefined for the missing sizes.
    expect(violations).toContainEqual({
      category: 'manifest',
      path: 'firefox-mv2.icons',
      reason:
        'Firefox artifact must declare the required icon sizes 16, 32, 48, 96, 128',
    })
    for (const violation of violations) {
      expect(violation.reason).not.toMatch(/declared icon file missing/i)
    }
  })
})

describe('assertFirefoxArtifactContract', () => {
  it('does not throw for a contract-compliant manifest and artifact', () => {
    expect(() =>
      assertFirefoxArtifactContract({
        manifest: createCompliantManifest(),
        fileExists: createFileExists(createCompliantArtifacts()),
        label: 'firefox-mv2',
      }),
    ).not.toThrow()
  })

  it('throws an AggregateError-style message listing every violation', () => {
    const manifest = createCompliantManifest()
    manifest.manifest_version = 3
    delete manifest.options_ui

    expect(() =>
      assertFirefoxArtifactContract({
        manifest,
        fileExists: createFileExists(new Set()),
        label: 'firefox-mv2',
      }),
    ).toThrow(/Firefox artifact contract violations/)
  })
})
