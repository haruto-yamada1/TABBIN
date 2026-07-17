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
  // string array; MV3 uses an array of { resources, matches } objects. Either
  // way, an empty array or absence exposes nothing. A non-empty array must be
  // on the approved allowlist (currently empty) and requires a security review.
  if ('web_accessible_resources' in manifest) {
    const resources = manifest.web_accessible_resources
    if (!Array.isArray(resources) || resources.length !== 0) {
      throw new Error(
        `${label} web_accessible_resources must be empty and match the approved allowlist (see docs/security/permissions.md); found ${JSON.stringify(resources)}`,
      )
    }
  }
}

const sortedJson = (value: unknown): string => JSON.stringify(value)

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
  if (sortedJson(chromeApiPermissions) !== sortedJson(firefoxApiPermissions)) {
    throw new Error(
      `Chrome and Firefox API permissions diverge: chrome=${sortedJson(chromeApiPermissions)} firefox=${sortedJson(firefoxApiPermissions)}`,
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
  if (sortedJson(chromeHosts) !== sortedJson(firefoxHosts)) {
    throw new Error(
      `Chrome and Firefox host permissions diverge: chrome=${sortedJson(chromeHosts)} firefox=${sortedJson(firefoxHosts)}`,
    )
  }

  const sharedKeys = new Set(Object.keys(chromeManifest))
  for (const key of Object.keys(firefoxManifest)) {
    sharedKeys.add(key)
  }
  const expectedDivergentKeys = new Set([
    'manifest_version',
    'permissions',
    'host_permissions',
    'content_security_policy',
    'browser_specific_settings',
    // Chrome MV3 uses `action`; Firefox MV2 uses `browser_action` for the same
    // toolbar action surface.
    'action',
    'browser_action',
    // Chrome MV3 uses a service worker; Firefox MV2 uses background scripts.
    'background',
  ])
  for (const key of sharedKeys) {
    if (expectedDivergentKeys.has(key)) {
      continue
    }
    if (sortedJson(chromeManifest[key]) !== sortedJson(firefoxManifest[key])) {
      throw new Error(
        `Chrome and Firefox manifest diverge on unexpected key "${key}": chrome=${sortedJson(chromeManifest[key])} firefox=${sortedJson(firefoxManifest[key])}`,
      )
    }
  }
}
