import { isRecord } from './manifestHelpers.ts'

export type FirefoxArtifactFilePredicate = (relativePath: string) => boolean

export type FirefoxArtifactViolation = {
  readonly category: 'manifest' | 'artifact'
  readonly path: string
  readonly reason: string
}

// Permissions that Firefox does not support. Listing these in the generated
// Firefox manifest is a strong signal that a Chrome-only path leaked into the
// artifact. Keep this list focused on permissions Firefox actually rejects;
// host permissions are validated by `assertChromeFirefoxManifestDelta`.
const CHROME_ONLY_API_PERMISSIONS = new Set([
  'debugger',
  'gcm',
  'system.display',
  'platformKeys',
  'printerProvider',
  'fileBrowserHandler',
  'input',
  'ttsengine',
  'tabCapture',
])

const REQUIRED_ICON_SIZES = ['16', '32', '48', '96', '128'] as const

const EXPECTED_DATA_COLLECTION_PERMISSIONS_REQUIRED = JSON.stringify(['none'])

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string')

const isStringRecord = (value: unknown): value is Record<string, string> =>
  isRecord(value) &&
  Object.values(value).every((item) => typeof item === 'string')

const quoteManifestValue = (value: unknown): string =>
  typeof value === 'string' ? `'${value}'` : String(value)

const hasDataCollectionPermissionsRequired = (
  manifest: Record<string, unknown>,
): boolean => {
  const browserSpecificSettings = manifest.browser_specific_settings
  if (!isRecord(browserSpecificSettings)) {
    return false
  }
  const gecko = browserSpecificSettings.gecko
  if (!isRecord(gecko)) {
    return false
  }
  const dataCollectionPermissions = gecko.data_collection_permissions
  if (!isRecord(dataCollectionPermissions)) {
    return false
  }
  return (
    JSON.stringify(dataCollectionPermissions.required) ===
    EXPECTED_DATA_COLLECTION_PERMISSIONS_REQUIRED
  )
}

const readBackgroundScripts = (
  manifest: Record<string, unknown>,
): string[] | undefined => {
  const background = manifest.background
  if (!isRecord(background)) {
    return undefined
  }
  const scripts = background.scripts
  if (!isStringArray(scripts)) {
    return undefined
  }
  return scripts
}

const isManifestObject = (
  manifest: unknown,
): manifest is Record<string, unknown> => isRecord(manifest)

const collectManifestShapeViolations = (
  manifest: Record<string, unknown>,
  label: string,
): FirefoxArtifactViolation[] => {
  const violations: FirefoxArtifactViolation[] = []
  if (manifest.manifest_version !== 2) {
    violations.push({
      category: 'manifest',
      path: label,
      reason: 'manifest_version must be 2 for Firefox artifact',
    })
  }
  if (typeof manifest.content_security_policy !== 'string') {
    violations.push({
      category: 'manifest',
      path: `${label}.content_security_policy`,
      reason:
        'Firefox MV2 content_security_policy must be a string (MV3 object form is rejected)',
    })
  }
  if (manifest.default_locale !== 'ja') {
    violations.push({
      category: 'manifest',
      path: `${label}.default_locale`,
      reason: `default_locale must be 'ja'; found ${quoteManifestValue(manifest.default_locale)}`,
    })
  }
  const optionsUi = manifest.options_ui
  if (!isRecord(optionsUi) || optionsUi.page !== 'options.html') {
    violations.push({
      category: 'manifest',
      path: `${label}.options_ui`,
      reason: "options_ui.page must be 'options.html'",
    })
  }
  return violations
}

const collectManifestFirefoxSurfaceViolations = (
  manifest: Record<string, unknown>,
  label: string,
): FirefoxArtifactViolation[] => {
  const violations: FirefoxArtifactViolation[] = []

  const icons = manifest.icons
  const hasRequiredIcons =
    isStringRecord(icons) && REQUIRED_ICON_SIZES.every((size) => size in icons)
  if (!hasRequiredIcons) {
    violations.push({
      category: 'manifest',
      path: `${label}.icons`,
      reason:
        'Firefox artifact must declare the required icon sizes 16, 32, 48, 96, 128',
    })
  }

  const permissions = manifest.permissions
  if (Array.isArray(permissions)) {
    for (const permission of permissions) {
      if (
        typeof permission === 'string' &&
        CHROME_ONLY_API_PERMISSIONS.has(permission)
      ) {
        violations.push({
          category: 'manifest',
          path: `${label}.permissions`,
          reason: `Chrome-only API permission detected: ${permission}`,
        })
      }
    }
  }

  if (!hasDataCollectionPermissionsRequired(manifest)) {
    violations.push({
      category: 'manifest',
      path: `${label}.browser_specific_settings`,
      reason:
        'Firefox artifact must declare browser_specific_settings.gecko.data_collection_permissions.required equal to ["none"]',
    })
  }

  const backgroundScripts = readBackgroundScripts(manifest)
  if (backgroundScripts === undefined || backgroundScripts.length === 0) {
    violations.push({
      category: 'manifest',
      path: `${label}.background`,
      reason:
        'Firefox artifact must declare background.scripts as a non-empty string array',
    })
  }

  return violations
}

const collectArtifactFileViolations = (
  manifest: Record<string, unknown>,
  fileExists: FirefoxArtifactFilePredicate,
  label: string,
): FirefoxArtifactViolation[] => {
  const violations: FirefoxArtifactViolation[] = []

  const backgroundScripts = readBackgroundScripts(manifest)
  if (backgroundScripts !== undefined) {
    for (const script of backgroundScripts) {
      if (!fileExists(script)) {
        violations.push({
          category: 'artifact',
          path: `${label}/${script}`,
          reason: 'declared background script missing in artifact',
        })
      }
    }
  }

  const optionsUi = manifest.options_ui
  if (
    isRecord(optionsUi) &&
    typeof optionsUi.page === 'string' &&
    !fileExists(optionsUi.page)
  ) {
    violations.push({
      category: 'artifact',
      path: `${label}/${optionsUi.page}`,
      reason: 'declared options_ui page missing in artifact',
    })
  }

  const icons = manifest.icons
  if (isStringRecord(icons)) {
    for (const size of REQUIRED_ICON_SIZES) {
      const iconPath = icons[size]
      if (!fileExists(iconPath)) {
        violations.push({
          category: 'artifact',
          path: `${label}/${iconPath}`,
          reason: 'declared icon file missing in artifact',
        })
      }
    }
  }

  if (!fileExists('_locales/ja/messages.json')) {
    violations.push({
      category: 'artifact',
      path: `${label}/_locales/ja/messages.json`,
      reason: 'default locale messages.json missing in artifact',
    })
  }

  if (!fileExists('_locales/en/messages.json')) {
    violations.push({
      category: 'artifact',
      path: `${label}/_locales/en/messages.json`,
      reason: 'fallback locale messages.json missing in artifact',
    })
  }

  return violations
}

export const collectFirefoxArtifactContractViolations = (params: {
  readonly manifest: unknown
  readonly fileExists: FirefoxArtifactFilePredicate
  readonly label?: string
}): readonly FirefoxArtifactViolation[] => {
  const { manifest, fileExists } = params
  const label = params.label ?? 'firefox-mv2'

  if (!isManifestObject(manifest)) {
    return [
      {
        category: 'manifest',
        path: label,
        reason: 'manifest must be an object',
      },
    ]
  }

  return [
    ...collectManifestShapeViolations(manifest, label),
    ...collectManifestFirefoxSurfaceViolations(manifest, label),
    ...collectArtifactFileViolations(manifest, fileExists, label),
  ]
}

export const assertFirefoxArtifactContract = (params: {
  readonly manifest: unknown
  readonly fileExists: FirefoxArtifactFilePredicate
  readonly label?: string
}): void => {
  const violations = collectFirefoxArtifactContractViolations(params)
  if (violations.length === 0) {
    return
  }
  const detail = violations
    .map(
      (violation) =>
        `  - [${violation.category}] ${violation.path}: ${violation.reason}`,
    )
    .join('\n')
  throw new Error(
    `Firefox artifact contract violations (${violations.length}):\n${detail}`,
  )
}
