export const PRODUCTION_OUTBOUND_ALLOWED_ORIGINS = [
  'http://localhost:11434',
  'http://127.0.0.1:11434',
] as const

export const PRODUCTION_OUTBOUND_HOST_PERMISSIONS =
  PRODUCTION_OUTBOUND_ALLOWED_ORIGINS.map((origin) => `${origin}/*`)

export const OLLAMA_BASE_URL = PRODUCTION_OUTBOUND_ALLOWED_ORIGINS[0]

const MANIFEST_VERSION_3 = '3'

export const createProductionExtensionCsp = (
  manifestVersion: number,
): string => {
  const scriptSources =
    String(manifestVersion) === MANIFEST_VERSION_3
      ? "'self' 'wasm-unsafe-eval'"
      : "'self'"
  return [
    "default-src 'self'",
    `script-src ${scriptSources}`,
    "object-src 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    `connect-src 'self' blob: ${PRODUCTION_OUTBOUND_ALLOWED_ORIGINS.join(' ')}`,
    "worker-src 'self'",
    "frame-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
  ].join('; ')
}

const OUTBOUND_NETWORK_PROTOCOLS = new Set(['http:', 'https:', 'ws:', 'wss:'])
const EXTENSION_PROTOCOLS = new Set(['chrome-extension:', 'moz-extension:'])
const ALLOWED_ORIGINS = new Set<string>(PRODUCTION_OUTBOUND_ALLOWED_ORIGINS)

export type ExtensionNetworkRequestObservation = {
  initiatorUrl: string | null
  method: string
  resourceType: string
  url: string
}

const parseUrl = (url: string): URL | null => {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

export const isOutboundNetworkUrl = (url: string): boolean => {
  const parsedUrl = parseUrl(url)
  return (
    parsedUrl !== null && OUTBOUND_NETWORK_PROTOCOLS.has(parsedUrl.protocol)
  )
}

export const isAllowedProductionOutboundUrl = (url: string): boolean => {
  const parsedUrl = parseUrl(url)
  return parsedUrl !== null && ALLOWED_ORIGINS.has(parsedUrl.origin)
}

export const isExtensionInitiatorUrl = (url: string): boolean => {
  const parsedUrl = parseUrl(url)
  return parsedUrl !== null && EXTENSION_PROTOCOLS.has(parsedUrl.protocol)
}

export const getUnexpectedExtensionOutboundRequest = (
  request: ExtensionNetworkRequestObservation,
): string | null => {
  if (
    request.initiatorUrl === null ||
    !isExtensionInitiatorUrl(request.initiatorUrl) ||
    !isOutboundNetworkUrl(request.url) ||
    isAllowedProductionOutboundUrl(request.url)
  ) {
    return null
  }
  return `${request.method} ${request.url} (initiator: ${request.initiatorUrl})`
}
