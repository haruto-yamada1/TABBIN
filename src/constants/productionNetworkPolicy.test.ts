import { describe, expect, it } from 'vitest'

import {
  OLLAMA_BASE_URL,
  PRODUCTION_OUTBOUND_HOST_PERMISSIONS,
  createProductionExtensionCsp,
  getUnexpectedExtensionOutboundRequest,
  isAllowedProductionOutboundUrl,
  isExtensionInitiatorUrl,
  isOutboundNetworkUrl,
} from './productionNetworkPolicy'

describe('production network policy', () => {
  it.each([
    'http://localhost:11434/api/tags',
    'http://127.0.0.1:11434/api/generate',
  ])('allows the configured Ollama loopback endpoint: %s', (url) => {
    expect(isAllowedProductionOutboundUrl(url)).toBe(true)
  })

  it.each([
    'https://localhost:11434/api/tags',
    'http://localhost:11435/api/tags',
    'http://192.168.1.10:11434/api/tags',
    'https://api.example.com/v1/chat',
    'not a url',
  ])('rejects an endpoint outside the production allowlist: %s', (url) => {
    expect(isAllowedProductionOutboundUrl(url)).toBe(false)
  })

  it.each([
    ['http://localhost:11434', true],
    ['https://example.com', true],
    ['ws://localhost:11434', true],
    ['wss://example.com', true],
    ['blob:chrome-extension://extension-id/value', false],
    ['chrome-extension://extension-id/app.html', false],
    ['data:text/plain,local', false],
    ['not a url', false],
  ])('classifies outbound network schemes for %s', (url, expected) => {
    expect(isOutboundNetworkUrl(url)).toBe(expected)
  })

  it('keeps the runtime Ollama URL inside the manifest allowlist', () => {
    expect(OLLAMA_BASE_URL).toBe('http://localhost:11434')
    expect(PRODUCTION_OUTBOUND_HOST_PERMISSIONS).toEqual([
      'http://localhost:11434/*',
      'http://127.0.0.1:11434/*',
    ])
  })

  it('creates fail-closed extension CSP for MV2 and MV3', () => {
    expect(createProductionExtensionCsp(2)).toBe(
      "default-src 'self'; script-src 'self'; object-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'self' blob: http://localhost:11434 http://127.0.0.1:11434; worker-src 'self'; frame-src 'none'; form-action 'none'; base-uri 'none'",
    )
    expect(createProductionExtensionCsp(3)).toBe(
      "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; object-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'self' blob: http://localhost:11434 http://127.0.0.1:11434; worker-src 'self'; frame-src 'none'; form-action 'none'; base-uri 'none'",
    )
  })

  it.each([
    ['chrome-extension://extension-id/background.js', true],
    ['moz-extension://extension-id/background.js', true],
    ['https://example.com/', false],
    ['about:blank', false],
    ['not a url', false],
  ])('classifies extension request initiators for %s', (url, expected) => {
    expect(isExtensionInitiatorUrl(url)).toBe(expected)
  })

  it.each([
    ['fetch', 'POST', 'https://api.example.com/v1/chat'],
    ['document', 'GET', 'https://api.example.com/collect?secret=value'],
  ])(
    'reports external %s requests from extension pages and service workers',
    (resourceType, method, url) => {
      expect(
        getUnexpectedExtensionOutboundRequest({
          initiatorUrl: 'chrome-extension://extension-id/app.html',
          method,
          resourceType,
          url,
        }),
      ).toBe(
        `${method} ${url} (initiator: chrome-extension://extension-id/app.html)`,
      )
    },
  )

  it.each([
    {
      initiatorUrl: 'chrome-extension://extension-id/background.js',
      method: 'POST',
      resourceType: 'fetch',
      url: 'http://localhost:11434/api/generate',
    },
    {
      initiatorUrl: 'https://visited.example.com/',
      method: 'GET',
      resourceType: 'image',
      url: 'https://cdn.example.com/image.png',
    },
    {
      initiatorUrl: 'chrome-extension://extension-id/app.html',
      method: 'GET',
      resourceType: 'fetch',
      url: 'blob:chrome-extension://extension-id/local-file',
    },
  ])('ignores allowed or non-outbound request %#', (request) => {
    expect(getUnexpectedExtensionOutboundRequest(request)).toBeNull()
  })
})
