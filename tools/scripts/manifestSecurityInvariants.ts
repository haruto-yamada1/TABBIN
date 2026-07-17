import {
  createProductionExtensionCsp,
  PRODUCTION_OUTBOUND_ALLOWED_ORIGINS,
} from '#production-network-policy'

import {
  isHostPermission,
  isRecord,
  readStringArray,
} from './manifestHelpers.ts'

const readExtensionPagesCsp = (
  manifest: Record<string, unknown>,
  label: string,
): string => {
  const value = manifest.content_security_policy
  if (typeof value === 'string') {
    return value
  }
  if (isRecord(value) && typeof value.extension_pages === 'string') {
    return value.extension_pages
  }
  throw new TypeError(
    `${label} content_security_policy is missing an extension policy`,
  )
}

const parseCspDirectives = (
  csp: string,
  label: string,
): Map<string, string[]> => {
  const directives = new Map<string, string[]>()
  const sections = csp
    .split(';')
    .map((section) => section.trim())
    .filter((section) => section !== '')
  for (const section of sections) {
    const [directive, ...values] = section.split(/\s+/u)
    if (directives.has(directive)) {
      throw new Error(
        `${label} content_security_policy contains duplicate directive ${directive}`,
      )
    }
    directives.set(directive, values)
  }
  return directives
}

export const assertExtensionCspMatchesProductionNetworkPolicy = (
  manifest: Record<string, unknown>,
  label: string,
  manifestVersion: 2 | 3,
): void => {
  const directives = parseCspDirectives(
    readExtensionPagesCsp(manifest, label),
    label,
  )
  const expectedConnectSources = [
    "'self'",
    'blob:',
    ...PRODUCTION_OUTBOUND_ALLOWED_ORIGINS,
  ].toSorted()
  const actualConnectSources = directives.get('connect-src')?.toSorted()
  if (
    actualConnectSources === undefined ||
    JSON.stringify(actualConnectSources) !==
      JSON.stringify(expectedConnectSources)
  ) {
    throw new Error(
      `${label} connect-src does not match the production allowlist: ${JSON.stringify(actualConnectSources)}; expected ${JSON.stringify(expectedConnectSources)}`,
    )
  }
  for (const directive of ['object-src', 'frame-src', 'form-action']) {
    if (
      JSON.stringify(directives.get(directive)) !== JSON.stringify(["'none'"])
    ) {
      throw new Error(`${label} ${directive} must be 'none'`)
    }
  }
  const expectedDirectives = parseCspDirectives(
    createProductionExtensionCsp(manifestVersion),
    'production network policy',
  )
  for (const [directive, expectedValues] of expectedDirectives) {
    if (directive === 'connect-src') {
      continue
    }
    const actualValues = directives.get(directive)
    if (
      actualValues === undefined ||
      JSON.stringify(actualValues.toSorted()) !==
        JSON.stringify(expectedValues.toSorted())
    ) {
      throw new Error(
        `${label} ${directive} does not match the production policy`,
      )
    }
  }
  const unexpectedDirectives = [...directives.keys()].filter(
    (directive) => !expectedDirectives.has(directive),
  )
  if (unexpectedDirectives.length !== 0) {
    throw new Error(
      `${label} content_security_policy contains unexpected directives: ${unexpectedDirectives.join(', ')}`,
    )
  }
}

const EXPECTED_MANIFEST_ABSENT_PROPERTIES: readonly {
  readonly property: string
  readonly reason: string
}[] = [
  {
    property: 'externally_connectable',
    reason:
      'a trust-boundary review approves external message senders (see docs/security/messaging-trust-boundary.md)',
  },
]

export const APPROVED_WEB_ACCESSIBLE_RESOURCES: readonly string[] = []

const ALLOWED_ACTION_FIELDS = new Set([
  'default_icon',
  'default_popup',
  'default_title',
])

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (isRecord(value)) {
    const keys = Object.keys(value).toSorted()
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

const assertManifestIncognitoPolicy = (
  manifest: Record<string, unknown>,
  label: string,
): void => {
  if (manifest.incognito !== 'not_allowed') {
    throw new Error(
      `${label} incognito must be "not_allowed"; found ${JSON.stringify(manifest.incognito)}`,
    )
  }
}

export const extractWebAccessibleResourcePaths = (
  manifest: Record<string, unknown>,
  label: string,
): string[] | undefined => {
  if (!('web_accessible_resources' in manifest)) {
    return undefined
  }
  const value = manifest.web_accessible_resources
  if (!Array.isArray(value)) {
    throw new TypeError(
      `${label} web_accessible_resources must be an array when present; found ${JSON.stringify(value)}`,
    )
  }
  // MV2: string[]. MV3: Array<{ resources: string[], matches?, extension_ids? }>.
  if (value.every((item) => typeof item === 'string')) {
    return value
  }
  const paths: string[] = []
  for (const entry of value) {
    if (
      !isRecord(entry) ||
      !Array.isArray(entry.resources) ||
      !entry.resources.every((resource) => typeof resource === 'string')
    ) {
      throw new Error(
        `${label} web_accessible_resources MV3 entries must be objects with a string[] resources field; found ${JSON.stringify(entry)}`,
      )
    }
    paths.push(...entry.resources)
  }
  return paths
}

export const assertWebAccessibleResourcesOnAllowlist = (
  manifest: Record<string, unknown>,
  label: string,
  allowlist: readonly string[],
): void => {
  const paths = extractWebAccessibleResourcePaths(manifest, label)
  if (paths === undefined) {
    return
  }
  const actual = [...new Set(paths)].toSorted()
  const expected = [...new Set(allowlist)].toSorted()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `${label} web_accessible_resources does not match the approved allowlist: found ${JSON.stringify(actual)}; expected ${JSON.stringify(expected)}. Update APPROVED_WEB_ACCESSIBLE_RESOURCES in tools/scripts/manifestSecurityInvariants.ts and docs/security/permissions.md after a security review.`,
    )
  }
}

const assertManifestPropertyAbsent = (
  manifest: Record<string, unknown>,
  property: string,
  label: string,
  reason: string,
): void => {
  if (property in manifest) {
    throw new Error(
      `${label} ${property} must be absent until ${reason}; found ${JSON.stringify(manifest[property])}`,
    )
  }
}

export const assertGeneratedManifestSecurityInvariants = (
  manifest: Record<string, unknown>,
  label: string,
): void => {
  for (const { property, reason } of EXPECTED_MANIFEST_ABSENT_PROPERTIES) {
    assertManifestPropertyAbsent(manifest, property, label, reason)
  }
  // WXT may emit an empty content_scripts array when no content scripts exist.
  // An empty array injects nothing and is acceptable; a non-empty array requires
  // a trust-boundary review.
  if ('content_scripts' in manifest) {
    const contentScripts = manifest.content_scripts
    if (!Array.isArray(contentScripts) || contentScripts.length !== 0) {
      throw new Error(
        `${label} content_scripts must be empty until a trust-boundary review approves content-script injection and storage access boundaries (see docs/security/messaging-trust-boundary.md); found ${JSON.stringify(contentScripts)}`,
      )
    }
  }
  // web_accessible_resources exposes extension assets to web pages. MV2 uses a
  // string array; MV3 uses an array of { resources, matches } objects. The
  // approved resource-path allowlist is the source of truth, so updating
  // APPROVED_WEB_ACCESSIBLE_RESOURCES actually permits approved resources.
  assertWebAccessibleResourcesOnAllowlist(
    manifest,
    label,
    APPROVED_WEB_ACCESSIBLE_RESOURCES,
  )
}

const readOptionalRecord = (
  manifest: Record<string, unknown>,
  property: string,
  label: string,
): Record<string, unknown> | undefined => {
  if (!(property in manifest)) {
    return undefined
  }
  const value = manifest[property]
  if (!isRecord(value)) {
    throw new Error(
      `${label} ${property} must be an object when present; found ${JSON.stringify(value)}`,
    )
  }
  return value
}

const assertAllowedActionFields = (
  surface: Record<string, unknown>,
  label: string,
): void => {
  for (const field of Object.keys(surface)) {
    if (!ALLOWED_ACTION_FIELDS.has(field)) {
      throw new Error(
        `${label} action surface has an unexpected field "${field}"; allowed: ${[...ALLOWED_ACTION_FIELDS].toSorted().join(', ')}`,
      )
    }
  }
}

const normalizeActionSurface = (
  manifest: Record<string, unknown>,
  label: string,
): Record<string, unknown> | undefined => {
  const action = readOptionalRecord(manifest, 'action', label)
  if (action !== undefined) {
    assertAllowedActionFields(action, label)
    return action
  }
  const browserAction = readOptionalRecord(manifest, 'browser_action', label)
  if (browserAction !== undefined) {
    assertAllowedActionFields(browserAction, label)
    return browserAction
  }
  return undefined
}

const normalizeBackgroundScripts = (
  manifest: Record<string, unknown>,
  label: string,
): Record<string, unknown> => {
  const background = readOptionalRecord(manifest, 'background', label)
  if (background === undefined) {
    return {}
  }
  const normalized: Record<string, unknown> = { ...background }
  if ('service_worker' in normalized) {
    const serviceWorker = normalized.service_worker
    if (typeof serviceWorker !== 'string') {
      throw new TypeError(
        `${label} background.service_worker must be a string; found ${JSON.stringify(serviceWorker)}`,
      )
    }
    normalized.scripts = [serviceWorker]
    delete normalized.service_worker
  }
  if (
    'scripts' in normalized &&
    (!Array.isArray(normalized.scripts) ||
      !normalized.scripts.every((script) => typeof script === 'string'))
  ) {
    throw new TypeError(
      `${label} background.scripts must be a string array; found ${JSON.stringify(normalized.scripts)}`,
    )
  }
  return normalized
}

const EXPECTED_FIREFOX_BROWSER_SPECIFIC_SETTINGS = {
  gecko: { data_collection_permissions: { required: ['none'] } },
}

const assertManifestSurfaceDelta = (
  chromeManifest: Record<string, unknown>,
  firefoxManifest: Record<string, unknown>,
  chromeLabel: string,
  firefoxLabel: string,
): void => {
  // action / browser_action are the same toolbar surface under MV3 / MV2 keys.
  // Normalize each to the allowed action fields and compare so an unexpected
  // browser-specific field on either surface is caught instead of skipped
  // wholesale.
  const chromeAction = normalizeActionSurface(chromeManifest, chromeLabel)
  const firefoxAction = normalizeActionSurface(firefoxManifest, firefoxLabel)
  if (canonicalJson(chromeAction) !== canonicalJson(firefoxAction)) {
    throw new Error(
      `Chrome and Firefox action surface diverge: chrome=${canonicalJson(chromeAction)} firefox=${canonicalJson(firefoxAction)}`,
    )
  }
  if ('browser_action' in chromeManifest) {
    throw new Error(
      `${chromeLabel} must not declare browser_action; MV3 uses action`,
    )
  }
  if ('action' in firefoxManifest) {
    throw new Error(
      `${firefoxLabel} must not declare action; MV2 uses browser_action`,
    )
  }

  // background: MV3 uses service_worker, MV2 uses scripts. Normalize to a
  // common scripts representation and compare the full structure so extra
  // browser-specific fields (e.g. type, persistent) diverge instead of being
  // skipped wholesale.
  const chromeBackground = normalizeBackgroundScripts(
    chromeManifest,
    chromeLabel,
  )
  const firefoxBackground = normalizeBackgroundScripts(
    firefoxManifest,
    firefoxLabel,
  )
  if (canonicalJson(chromeBackground) !== canonicalJson(firefoxBackground)) {
    throw new Error(
      `Chrome and Firefox background diverge: chrome=${canonicalJson(chromeBackground)} firefox=${canonicalJson(firefoxBackground)}`,
    )
  }

  // browser_specific_settings is Firefox-only. Chrome must not declare it and
  // Firefox must match the documented expected structure so any change is
  // caught rather than skipped wholesale.
  if ('browser_specific_settings' in chromeManifest) {
    throw new Error(`${chromeLabel} must not declare browser_specific_settings`)
  }
  if (
    canonicalJson(firefoxManifest.browser_specific_settings) !==
    canonicalJson(EXPECTED_FIREFOX_BROWSER_SPECIFIC_SETTINGS)
  ) {
    throw new Error(
      `${firefoxLabel} browser_specific_settings does not match the expected Firefox structure: found ${canonicalJson(firefoxManifest.browser_specific_settings)}; expected ${canonicalJson(EXPECTED_FIREFOX_BROWSER_SPECIFIC_SETTINGS)}`,
    )
  }
}

export const assertChromeFirefoxManifestDelta = (
  chromeManifest: unknown,
  firefoxManifest: unknown,
  chromeLabel: string,
  firefoxLabel: string,
): void => {
  if (!isRecord(chromeManifest) || !isRecord(firefoxManifest)) {
    throw new TypeError('chrome and firefox manifests must be objects')
  }
  if (chromeManifest.manifest_version !== 3) {
    throw new Error(
      `${chromeLabel} manifest_version must be 3, got ${JSON.stringify(chromeManifest.manifest_version)}`,
    )
  }
  if (firefoxManifest.manifest_version !== 2) {
    throw new Error(
      `${firefoxLabel} manifest_version must be 2, got ${JSON.stringify(firefoxManifest.manifest_version)}`,
    )
  }

  assertManifestIncognitoPolicy(chromeManifest, chromeLabel)
  assertManifestIncognitoPolicy(firefoxManifest, firefoxLabel)

  const chromeApiPermissions = readStringArray(
    chromeManifest,
    'permissions',
    chromeLabel,
  )
    .filter((permission) => !isHostPermission(permission))
    .toSorted()
  const firefoxApiPermissions = readStringArray(
    firefoxManifest,
    'permissions',
    firefoxLabel,
  )
    .filter((permission) => !isHostPermission(permission))
    .toSorted()
  if (
    canonicalJson(chromeApiPermissions) !== canonicalJson(firefoxApiPermissions)
  ) {
    throw new Error(
      `Chrome and Firefox API permissions diverge: chrome=${canonicalJson(chromeApiPermissions)} firefox=${canonicalJson(firefoxApiPermissions)}`,
    )
  }

  const chromeHosts = readStringArray(
    chromeManifest,
    'host_permissions',
    chromeLabel,
  ).toSorted()
  const firefoxHosts = readStringArray(
    firefoxManifest,
    'permissions',
    firefoxLabel,
  )
    .filter((permission) => isHostPermission(permission))
    .toSorted()
  if (canonicalJson(chromeHosts) !== canonicalJson(firefoxHosts)) {
    throw new Error(
      `Chrome and Firefox host permissions diverge: chrome=${canonicalJson(chromeHosts)} firefox=${canonicalJson(firefoxHosts)}`,
    )
  }

  assertManifestSurfaceDelta(
    chromeManifest,
    firefoxManifest,
    chromeLabel,
    firefoxLabel,
  )

  const sharedKeys = new Set(Object.keys(chromeManifest))
  for (const key of Object.keys(firefoxManifest)) {
    sharedKeys.add(key)
  }
  // Keys handled by the explicit normalized comparisons above. They are skipped
  // in the generic loop because their raw shapes differ by manifest version,
  // but their normalized forms have already been compared.
  const expectedDivergentKeys = new Set([
    'manifest_version',
    'permissions',
    'host_permissions',
    'content_security_policy',
    'action',
    'browser_action',
    'background',
    'browser_specific_settings',
  ])
  for (const key of sharedKeys) {
    if (expectedDivergentKeys.has(key)) {
      continue
    }
    if (
      canonicalJson(chromeManifest[key]) !== canonicalJson(firefoxManifest[key])
    ) {
      throw new Error(
        `Chrome and Firefox manifest diverge on unexpected key "${key}": chrome=${canonicalJson(chromeManifest[key])} firefox=${canonicalJson(firefoxManifest[key])}`,
      )
    }
  }
}
