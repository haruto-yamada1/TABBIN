import path from 'node:path'

import { createProductionExtensionCsp } from '#production-network-policy'
import { describe, expect, it } from 'vitest'

import {
  APPROVED_WEB_ACCESSIBLE_RESOURCES,
  assertChromeFirefoxManifestDelta,
  assertWebAccessibleResourcesOnAllowlist,
} from './manifestSecurityInvariants'
import {
  assertManifestMatchesProductionNetworkPolicy,
  assertProductionNetworkCallsiteInventory,
  collectProductionNetworkCallsites,
  collectSourceNetworkCallsites,
  normalizeNetworkCallsite,
} from './production-network-policy'

describe('collectSourceNetworkCallsites', () => {
  it('discovers browser network APIs and explicit network clients from syntax', () => {
    const callsites = collectSourceNetworkCallsites(
      'src/network.ts',
      `
        import { generateText } from 'ai'
        import { createOllama } from 'ai-sdk-ollama'
        import axios from 'axios'

        fetch('https://example.com')
        new XMLHttpRequest()
        new WebSocket('wss://example.com')
        new EventSource('https://example.com/events')
        navigator.sendBeacon('https://example.com/events')
      `,
    )

    expect(callsites.map(normalizeNetworkCallsite)).toEqual([
      {
        detail: 'ai-sdk-ollama',
        kind: 'network-client-import',
        path: 'src/network.ts',
      },
      {
        detail: 'axios',
        kind: 'network-client-import',
        path: 'src/network.ts',
      },
      { kind: 'fetch', path: 'src/network.ts' },
      { kind: 'xml-http-request', path: 'src/network.ts' },
      { kind: 'websocket', path: 'src/network.ts' },
      { kind: 'event-source', path: 'src/network.ts' },
      { kind: 'send-beacon', path: 'src/network.ts' },
    ])
  })

  it('does not treat URL strings or navigation APIs as network call sites', () => {
    expect(
      collectSourceNetworkCallsites(
        'src/links.ts',
        `
          const docs = 'https://example.com/docs'
          window.open(docs)
          chrome.tabs.create({ url: docs })
        `,
      ),
    ).toEqual([])
  })

  it('resolves global API aliases, computed access, and dynamic network-client imports', () => {
    const callsites = collectSourceNetworkCallsites(
      'src/indirect-network.ts',
      `
        import OpenAI from 'openai'
        const request = fetch
        const computedRequest = globalThis['fetch']
        const { fetch: destructuredRequest } = globalThis
        const Socket = globalThis['WebSocket']

        request('https://example.com/one')
        computedRequest('https://example.com/two')
        destructuredRequest('https://example.com/three')
        new Socket('wss://example.com')
        await import('axios')
      `,
    )

    expect(callsites.map(normalizeNetworkCallsite)).toEqual([
      {
        detail: 'axios',
        kind: 'network-client-import',
        path: 'src/indirect-network.ts',
      },
      {
        detail: 'openai',
        kind: 'network-client-import',
        path: 'src/indirect-network.ts',
      },
      { kind: 'fetch', path: 'src/indirect-network.ts' },
      { kind: 'fetch', path: 'src/indirect-network.ts' },
      { kind: 'fetch', path: 'src/indirect-network.ts' },
      { kind: 'websocket', path: 'src/indirect-network.ts' },
    ])
  })

  it('resolves shorthand and navigator aliases without treating unrelated bindings as network calls', () => {
    const callsites = collectSourceNetworkCallsites(
      'src/bindings.ts',
      `
        let uninitialized
        const { fetch } = globalThis
        const { 'fetch': quotedFetch, unknown } = globalThis
        const { sendBeacon: beacon } = navigator
        const [arrayBinding] = [fetch]

        fetch('https://example.com/one')
        quotedFetch('https://example.com/two')
        beacon('https://example.com/three')
      `,
    )

    expect(callsites.map(normalizeNetworkCallsite)).toEqual([
      { kind: 'fetch', path: 'src/bindings.ts' },
      { kind: 'fetch', path: 'src/bindings.ts' },
      { kind: 'send-beacon', path: 'src/bindings.ts' },
    ])
  })

  it('tracks assigned and bound aliases plus call/apply invocations without stale aliases', () => {
    const callsites = collectSourceNetworkCallsites(
      'src/assigned-network.ts',
      `
        let assignedRequest
        assignedRequest = fetch
        assignedRequest('https://example.com/assigned')

        const boundRequest = fetch.bind(globalThis)
        boundRequest('https://example.com/bound')
        fetch.call(globalThis, 'https://example.com/call')
        fetch.apply(globalThis, ['https://example.com/apply'])

        assignedRequest = () => undefined
        assignedRequest('not a network call')
      `,
    )

    expect(callsites.map(normalizeNetworkCallsite)).toEqual([
      { kind: 'fetch', path: 'src/assigned-network.ts' },
      { kind: 'fetch', path: 'src/assigned-network.ts' },
      { kind: 'fetch', path: 'src/assigned-network.ts' },
      { kind: 'fetch', path: 'src/assigned-network.ts' },
    ])
  })

  it('restores outer aliases after nested lexical shadowing', () => {
    expect(
      collectSourceNetworkCallsites(
        'src/scoped-network.ts',
        `
        const request = fetch
        function localHelper() {
          const request = () => undefined
          request('local')
        }
        request('https://example.com/outbound')
      `,
      ).map(normalizeNetworkCallsite),
    ).toEqual([{ kind: 'fetch', path: 'src/scoped-network.ts' }])
  })

  it('does not treat a shadowed fetch parameter as the global network API', () => {
    expect(
      collectSourceNetworkCallsites(
        'src/injected-network.ts',
        `
          function injectedHelper(fetch) {
            fetch('local')
          }
        `,
      ),
    ).toEqual([])
  })

  it('isolates nested function assignments from enclosing aliases', () => {
    expect(
      collectSourceNetworkCallsites(
        'src/nested-assignment.ts',
        `
          const request = fetch
          function localHelper() {
            request = () => undefined
            request('local')
          }
          request('https://example.com/outbound')
        `,
      ).map(normalizeNetworkCallsite),
    ).toEqual([{ kind: 'fetch', path: 'src/nested-assignment.ts' }])
  })

  it('preserves possible network aliases after conditional assignments', () => {
    expect(
      collectSourceNetworkCallsites(
        'src/conditional-assignment.ts',
        `
          let request = fetch
          if (useLocal) {
            request = () => undefined
          }
          request('https://example.com/outbound')
        `,
      ).map(normalizeNetworkCallsite),
    ).toEqual([{ kind: 'fetch', path: 'src/conditional-assignment.ts' }])

    expect(
      collectSourceNetworkCallsites(
        'src/conditional-global-assignment.ts',
        `
          if (useLocal) {
            fetch = () => undefined
          }
          fetch('https://example.com/outbound')
        `,
      ).map(normalizeNetworkCallsite),
    ).toEqual([{ kind: 'fetch', path: 'src/conditional-global-assignment.ts' }])
  })

  it('keeps for and switch lexical bindings from overwriting outer aliases', () => {
    expect(
      collectSourceNetworkCallsites(
        'src/control-flow-bindings.ts',
        `
          const request = fetch
          for (const request of localRequests) {
            request('local')
          }
          switch (mode) {
            case 'local':
              const request = () => undefined
              request('local')
              break
          }
          request('https://example.com/outbound')
        `,
      ).map(normalizeNetworkCallsite),
    ).toEqual([{ kind: 'fetch', path: 'src/control-flow-bindings.ts' }])
  })

  it('preserves possible aliases after loop and switch assignments', () => {
    expect(
      collectSourceNetworkCallsites(
        'src/control-flow-assignments.ts',
        `
          let loopRequest = fetch
          for (const item of items) {
            loopRequest = () => item
          }
          loopRequest('https://example.com/after-loop')

          let switchRequest = fetch
          switch (mode) {
            case 'local':
              switchRequest = () => undefined
              break
          }
          switchRequest('https://example.com/after-switch')
        `,
      ).map(normalizeNetworkCallsite),
    ).toEqual([
      { kind: 'fetch', path: 'src/control-flow-assignments.ts' },
      { kind: 'fetch', path: 'src/control-flow-assignments.ts' },
    ])
  })

  it('preserves possible aliases after while and short-circuit assignments', () => {
    expect(
      collectSourceNetworkCallsites(
        'src/additional-control-flow.ts',
        `
          let loopRequest = fetch
          while (shouldReplace) {
            loopRequest = () => undefined
          }
          loopRequest('https://example.com/after-while')

          let branchRequest = fetch
          shouldReplace && (branchRequest = () => undefined)
          branchRequest('https://example.com/after-short-circuit')
        `,
      ).map(normalizeNetworkCallsite),
    ).toEqual([
      { kind: 'fetch', path: 'src/additional-control-flow.ts' },
      { kind: 'fetch', path: 'src/additional-control-flow.ts' },
    ])
  })

  it('includes captured aliases assigned after a function declaration', () => {
    expect(
      collectSourceNetworkCallsites(
        'src/later-captured-alias.ts',
        `
          let request
          function send() {
            request('https://example.com/from-closure')
          }
          request = fetch
          send()
        `,
      ).map(normalizeNetworkCallsite),
    ).toEqual([{ kind: 'fetch', path: 'src/later-captured-alias.ts' }])
  })

  it('tracks aliases assigned from conditional and logical expressions', () => {
    expect(
      collectSourceNetworkCallsites(
        'src/expression-aliases.ts',
        `
          const conditionalRequest = flag ? fetch : (() => undefined)
          conditionalRequest('https://example.com/conditional')

          const logicalRequest = flag && fetch
          logicalRequest('https://example.com/logical')
        `,
      ).map(normalizeNetworkCallsite),
    ).toEqual([
      { kind: 'fetch', path: 'src/expression-aliases.ts' },
      { kind: 'fetch', path: 'src/expression-aliases.ts' },
    ])
  })

  it('keeps potential captured aliases isolated by function environment', () => {
    expect(
      collectSourceNetworkCallsites(
        'src/isolated-potential-aliases.ts',
        `
          let request = () => undefined
          function send() {
            request('local')
          }
          function unrelated() {
            const request = fetch
            request('https://example.com/unrelated')
          }
        `,
      ).map(normalizeNetworkCallsite),
    ).toEqual([{ kind: 'fetch', path: 'src/isolated-potential-aliases.ts' }])
  })

  it('tracks nested closures by lexical binding scope', () => {
    expect(
      collectSourceNetworkCallsites(
        'src/nested-closure-alias.ts',
        `
          function outer() {
            let request
            function inner() {
              request('https://example.com/nested')
            }
            request = fetch
          }
        `,
      ).map(normalizeNetworkCallsite),
    ).toEqual([{ kind: 'fetch', path: 'src/nested-closure-alias.ts' }])
  })

  it('does not pollute outer aliases with block-shadowed potentials', () => {
    expect(
      collectSourceNetworkCallsites(
        'src/block-shadow-potential.ts',
        `
          let request = () => undefined
          function send() {
            request('local')
          }
          {
            const request = fetch
            request('https://example.com/block')
          }
        `,
      ).map(normalizeNetworkCallsite),
    ).toEqual([{ kind: 'fetch', path: 'src/block-shadow-potential.ts' }])
  })

  it('merges try and catch aliases while preserving catch binding scope', () => {
    expect(
      collectSourceNetworkCallsites(
        'src/try-catch-alias.ts',
        `
          let request = fetch
          try {
            work()
          } catch {
            request = () => undefined
          }
          request('https://example.com/after-catch')

          let shadowedRequest = fetch
          try {
            work()
          } catch (shadowedRequest) {
            shadowedRequest = () => undefined
          }
          shadowedRequest('https://example.com/after-shadowed-catch')
        `,
      ).map(normalizeNetworkCallsite),
    ).toEqual([
      { kind: 'fetch', path: 'src/try-catch-alias.ts' },
      { kind: 'fetch', path: 'src/try-catch-alias.ts' },
    ])
  })

  it('propagates captured network aliases from callable functions', () => {
    expect(
      collectSourceNetworkCallsites(
        'src/callable-captured-alias.ts',
        `
          let iifeRequest = () => undefined
          ;(() => {
            iifeRequest = fetch
          })()
          iifeRequest('https://example.com/iife')

          let namedRequest = () => undefined
          function enableNetwork() {
            namedRequest = fetch
          }
          enableNetwork()
          namedRequest('https://example.com/named')
        `,
      ).map(normalizeNetworkCallsite),
    ).toEqual([
      { kind: 'fetch', path: 'src/callable-captured-alias.ts' },
      { kind: 'fetch', path: 'src/callable-captured-alias.ts' },
    ])
  })

  it('does not include an impossible zero-iteration path for do-while', () => {
    expect(
      collectSourceNetworkCallsites(
        'src/do-while-alias.ts',
        `
          let request = fetch
          do {
            request = () => undefined
          } while (false)
          request('local')
        `,
      ),
    ).toEqual([])
  })
})

describe('production network call-site inventory', () => {
  it('requires every production network call site to be explicitly inventoried', () => {
    const projectRoot = path.resolve(import.meta.dirname, '..', '..')

    const callsites = collectProductionNetworkCallsites(projectRoot)
    expect(callsites.map(normalizeNetworkCallsite)).toEqual([
      {
        detail: 'ai-sdk-ollama',
        kind: 'network-client-import',
        path: 'src/lib/background/ai-chat.ts',
      },
      {
        kind: 'fetch',
        path: 'src/components/ai-elements/prompt-input.tsx',
      },
    ])
    expect(() =>
      assertProductionNetworkCallsiteInventory(callsites),
    ).not.toThrow()
  }, 30000)

  it('reports the full changed inventory with source locations', () => {
    expect(() =>
      assertProductionNetworkCallsiteInventory([
        { kind: 'fetch', line: 4, path: 'src/new-client.ts' },
        {
          detail: 'openai',
          kind: 'network-client-import',
          line: 1,
          path: 'src/new-client.ts',
        },
      ]),
    ).toThrow(
      /src\/new-client\.ts:4 fetch[\s\S]*src\/new-client\.ts:1 network-client-import \(openai\)/,
    )
  })
})

describe('assertManifestMatchesProductionNetworkPolicy', () => {
  it('accepts the exact required host permissions', () => {
    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          content_security_policy: {
            extension_pages: createProductionExtensionCsp(3),
          },
          host_permissions: [
            'http://127.0.0.1:11434/*',
            'http://localhost:11434/*',
          ],
          manifest_version: 3,
          permissions: [
            'alarms',
            'tabs',
            'storage',
            'contextMenus',
            'notifications',
            'unlimitedStorage',
          ],
        },
        'manifest.json',
      ),
    ).not.toThrow()
  })

  it('extracts host patterns from Firefox MV2 permissions', () => {
    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          content_security_policy: createProductionExtensionCsp(2),
          manifest_version: 2,
          permissions: [
            'alarms',
            'tabs',
            'storage',
            'contextMenus',
            'notifications',
            'unlimitedStorage',
            'http://127.0.0.1:11434/*',
            'http://localhost:11434/*',
          ],
        },
        'firefox.json',
      ),
    ).not.toThrow()

    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          manifest_version: 2,
          permissions: [
            'storage',
            'http://127.0.0.1:11434/*',
            'http://localhost:11434/*',
          ],
          optional_permissions: ['tabs', 'https://api.example.com/*'],
        },
        'firefox-optional.json',
      ),
    ).toThrow(/firefox-optional\.json.*optional_permissions/)
  })

  it('rejects missing, added, or optional API permissions', () => {
    const manifest = {
      content_security_policy: {
        extension_pages: createProductionExtensionCsp(3),
      },
      host_permissions: [
        'http://127.0.0.1:11434/*',
        'http://localhost:11434/*',
      ],
      manifest_version: 3,
    }
    const requiredPermissions = [
      'alarms',
      'tabs',
      'storage',
      'contextMenus',
      'notifications',
      'unlimitedStorage',
    ]

    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          ...manifest,
          permissions: requiredPermissions.filter(
            (permission) => permission !== 'unlimitedStorage',
          ),
        },
        'missing-api-permission.json',
      ),
    ).toThrow(/missing-api-permission\.json.*permissions/)

    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          ...manifest,
          permissions: [...requiredPermissions, 'history'],
        },
        'added-api-permission.json',
      ),
    ).toThrow(/added-api-permission\.json.*permissions/)

    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          ...manifest,
          optional_permissions: ['downloads'],
          permissions: requiredPermissions,
        },
        'optional-api-permission.json',
      ),
    ).toThrow(/optional-api-permission\.json.*optional_permissions/)
  })

  it('rejects added, missing, optional, or malformed host permissions', () => {
    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          host_permissions: [
            'http://localhost:11434/*',
            'https://api.example.com/*',
          ],
          manifest_version: 3,
        },
        'added.json',
      ),
    ).toThrow(/added\.json.*host_permissions/)

    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          host_permissions: ['http://localhost:11434/*'],
          manifest_version: 3,
        },
        'missing.json',
      ),
    ).toThrow(/missing\.json.*host_permissions/)

    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          host_permissions: [
            'http://localhost:11434/*',
            'http://127.0.0.1:11434/*',
          ],
          manifest_version: 3,
          optional_host_permissions: ['https://api.example.com/*'],
        },
        'optional.json',
      ),
    ).toThrow(/optional\.json.*optional_host_permissions/)

    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          host_permissions: 'http://localhost:11434/*',
          manifest_version: 3,
        },
        'malformed.json',
      ),
    ).toThrow(/malformed\.json.*host_permissions/)
  })

  it('rejects missing or broad extension connect-src policy', () => {
    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          host_permissions: [
            'http://localhost:11434/*',
            'http://127.0.0.1:11434/*',
          ],
          manifest_version: 3,
        },
        'missing-csp.json',
      ),
    ).toThrow(/missing-csp\.json.*content_security_policy/)

    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          content_security_policy: {
            extension_pages:
              "script-src 'self'; object-src 'none'; connect-src *; frame-src 'none'; form-action 'none';",
          },
          host_permissions: [
            'http://localhost:11434/*',
            'http://127.0.0.1:11434/*',
          ],
          manifest_version: 3,
        },
        'broad-csp.json',
      ),
    ).toThrow(/broad-csp\.json.*connect-src/)
  })

  it('rejects malformed, weakened, or extended CSP directives', () => {
    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(null, 'null.json'),
    ).toThrow(/null\.json.*not an object/)

    const host_permissions = [
      'http://localhost:11434/*',
      'http://127.0.0.1:11434/*',
    ]
    const csp = createProductionExtensionCsp(3)

    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          content_security_policy: {
            extension_pages: csp.replace(
              "object-src 'none'",
              "object-src 'self'",
            ),
          },
          host_permissions,
          manifest_version: 3,
        },
        'object-src.json',
      ),
    ).toThrow(/object-src\.json.*object-src/)

    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          content_security_policy: {
            extension_pages: csp.replace(
              "frame-src 'none'",
              "frame-src 'self'",
            ),
          },
          host_permissions,
          manifest_version: 3,
        },
        'frame-src.json',
      ),
    ).toThrow(/frame-src\.json.*frame-src must be 'none'/)

    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          content_security_policy: {
            extension_pages: csp.replace(
              "script-src 'self' 'wasm-unsafe-eval'",
              "script-src 'self'",
            ),
          },
          host_permissions,
          manifest_version: 3,
        },
        'script-src.json',
      ),
    ).toThrow(/script-src\.json.*script-src/)

    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          content_security_policy: {
            extension_pages: `${csp}; report-uri https://example.com/csp`,
          },
          host_permissions,
          manifest_version: 3,
        },
        'extra-directive.json',
      ),
    ).toThrow(/extra-directive\.json.*unexpected directives/)
  })

  it('rejects duplicate CSP directives instead of applying last-write-wins parsing', () => {
    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          content_security_policy: {
            extension_pages: `connect-src *; ${createProductionExtensionCsp(3)}`,
          },
          host_permissions: [
            'http://localhost:11434/*',
            'http://127.0.0.1:11434/*',
          ],
          manifest_version: 3,
        },
        'duplicate-csp.json',
      ),
    ).toThrow(/duplicate-csp\.json.*duplicate.*connect-src/)
  })

  it('allows empty optional host permissions', () => {
    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          content_security_policy: {
            extension_pages: createProductionExtensionCsp(3),
          },
          host_permissions: [
            'http://localhost:11434/*',
            'http://127.0.0.1:11434/*',
          ],
          manifest_version: 3,
          optional_host_permissions: [],
          permissions: [
            'alarms',
            'tabs',
            'storage',
            'contextMenus',
            'notifications',
            'unlimitedStorage',
          ],
        },
        'empty-optional.json',
      ),
    ).not.toThrow()
  })

  it.each([
    ['missing', undefined],
    ['string', '3'],
    ['unsupported', 4],
  ])('rejects %s manifest_version values', (label, manifestVersion) => {
    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          content_security_policy: {
            extension_pages: createProductionExtensionCsp(3),
          },
          host_permissions: [
            'http://localhost:11434/*',
            'http://127.0.0.1:11434/*',
          ],
          ...(manifestVersion === undefined
            ? {}
            : { manifest_version: manifestVersion }),
        },
        `${label}-version.json`,
      ),
    ).toThrow(new RegExp(`${label}-version\\.json.*manifest_version.*2 or 3`))
  })

  it('rejects an externally_connectable surface added without a trust-boundary review', () => {
    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          content_security_policy: {
            extension_pages: createProductionExtensionCsp(3),
          },
          externally_connectable: {
            matches: ['https://example.com/*'],
          },
          host_permissions: [
            'http://localhost:11434/*',
            'http://127.0.0.1:11434/*',
          ],
          manifest_version: 3,
          permissions: [
            'alarms',
            'tabs',
            'storage',
            'contextMenus',
            'notifications',
            'unlimitedStorage',
          ],
        },
        'external-connectable.json',
      ),
    ).toThrow(
      /external-connectable\.json.*externally_connectable.*trust-boundary/,
    )
  })

  it('rejects content_scripts added without a trust-boundary review', () => {
    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          content_security_policy: {
            extension_pages: createProductionExtensionCsp(3),
          },
          content_scripts: [
            {
              js: ['content.js'],
              matches: ['https://example.com/*'],
            },
          ],
          host_permissions: [
            'http://localhost:11434/*',
            'http://127.0.0.1:11434/*',
          ],
          manifest_version: 3,
          permissions: [
            'alarms',
            'tabs',
            'storage',
            'contextMenus',
            'notifications',
            'unlimitedStorage',
          ],
        },
        'content-scripts.json',
      ),
    ).toThrow(/content-scripts\.json.*content_scripts.*trust-boundary/)
  })

  it('rejects an unapproved web_accessible_resources entry', () => {
    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          content_security_policy: {
            extension_pages: createProductionExtensionCsp(3),
          },
          host_permissions: [
            'http://localhost:11434/*',
            'http://127.0.0.1:11434/*',
          ],
          manifest_version: 3,
          permissions: [
            'alarms',
            'tabs',
            'storage',
            'contextMenus',
            'notifications',
            'unlimitedStorage',
          ],
          web_accessible_resources: ['options.html'],
        },
        'war.json',
      ),
    ).toThrow(/war\.json.*web_accessible_resources.*allowlist/)
  })

  it('accepts an absent web_accessible_resources surface', () => {
    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          content_security_policy: {
            extension_pages: createProductionExtensionCsp(3),
          },
          host_permissions: [
            'http://localhost:11434/*',
            'http://127.0.0.1:11434/*',
          ],
          manifest_version: 3,
          permissions: [
            'alarms',
            'tabs',
            'storage',
            'contextMenus',
            'notifications',
            'unlimitedStorage',
          ],
        },
        'no-war.json',
      ),
    ).not.toThrow()
  })

  it('web_accessible_resources approved allowlist is empty until a review adds entries', () => {
    expect(APPROVED_WEB_ACCESSIBLE_RESOURCES).toEqual([])
  })

  it('web_accessible_resources on the approved allowlist is accepted (MV2 string form)', () => {
    expect(() =>
      assertWebAccessibleResourcesOnAllowlist(
        { web_accessible_resources: ['options.html'] },
        'allow.json',
        ['options.html'],
      ),
    ).not.toThrow()
  })

  it('web_accessible_resources on the approved allowlist is accepted (MV3 object form)', () => {
    expect(() =>
      assertWebAccessibleResourcesOnAllowlist(
        {
          web_accessible_resources: [
            {
              matches: ['https://example.com/*'],
              resources: ['options.html'],
            },
          ],
        },
        'allow-mv3.json',
        ['options.html'],
      ),
    ).not.toThrow()
  })

  it('web_accessible_resources outside the approved allowlist is rejected', () => {
    expect(() =>
      assertWebAccessibleResourcesOnAllowlist(
        { web_accessible_resources: ['other.html'] },
        'mismatch.json',
        ['options.html'],
      ),
    ).toThrow(/mismatch\.json.*web_accessible_resources.*allowlist/)
  })

  it('web_accessible_resources with an extra entry beyond the approved allowlist is rejected', () => {
    expect(() =>
      assertWebAccessibleResourcesOnAllowlist(
        { web_accessible_resources: ['options.html', 'other.html'] },
        'extra.json',
        ['options.html'],
      ),
    ).toThrow(/extra\.json.*web_accessible_resources.*allowlist/)
  })

  it('rejects a malformed web_accessible_resources MV3 entry', () => {
    expect(() =>
      assertWebAccessibleResourcesOnAllowlist(
        {
          web_accessible_resources: [
            { matches: ['https://example.com/*'], resources: [123] },
          ],
        },
        'bad-mv3.json',
        [],
      ),
    ).toThrow(/bad-mv3\.json.*MV3 entries.*string\[\] resources/)
  })

  it('rejects a non-empty web_accessible_resources MV3 object form', () => {
    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          content_security_policy: {
            extension_pages: createProductionExtensionCsp(3),
          },
          host_permissions: [
            'http://localhost:11434/*',
            'http://127.0.0.1:11434/*',
          ],
          manifest_version: 3,
          permissions: [
            'alarms',
            'tabs',
            'storage',
            'contextMenus',
            'notifications',
            'unlimitedStorage',
          ],
          web_accessible_resources: [
            { matches: ['https://example.com/*'], resources: ['options.html'] },
          ],
        },
        'war-object.json',
      ),
    ).toThrow(/war-object\.json.*web_accessible_resources.*allowlist/)
  })

  it('rejects a malformed content_scripts value that is not an array', () => {
    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          content_security_policy: {
            extension_pages: createProductionExtensionCsp(3),
          },
          content_scripts: 'not-an-array',
          host_permissions: [
            'http://localhost:11434/*',
            'http://127.0.0.1:11434/*',
          ],
          manifest_version: 3,
          permissions: [
            'alarms',
            'tabs',
            'storage',
            'contextMenus',
            'notifications',
            'unlimitedStorage',
          ],
        },
        'malformed-content-scripts.json',
      ),
    ).toThrow(
      /malformed-content-scripts\.json.*content_scripts.*trust-boundary/,
    )
  })

  it('rejects a malformed web_accessible_resources value that is not an array', () => {
    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          content_security_policy: {
            extension_pages: createProductionExtensionCsp(3),
          },
          host_permissions: [
            'http://localhost:11434/*',
            'http://127.0.0.1:11434/*',
          ],
          manifest_version: 3,
          permissions: [
            'alarms',
            'tabs',
            'storage',
            'contextMenus',
            'notifications',
            'unlimitedStorage',
          ],
          web_accessible_resources: 'options.html',
        },
        'malformed-war.json',
      ),
    ).toThrow(/malformed-war\.json.*web_accessible_resources.*array/)
  })

  it('rejects a permissions array containing non-string entries', () => {
    expect(() =>
      assertManifestMatchesProductionNetworkPolicy(
        {
          content_security_policy: {
            extension_pages: createProductionExtensionCsp(3),
          },
          host_permissions: [
            'http://localhost:11434/*',
            'http://127.0.0.1:11434/*',
          ],
          manifest_version: 3,
          permissions: ['storage', 123],
        },
        'non-string-permissions.json',
      ),
    ).toThrow(/non-string-permissions\.json.*permissions.*string array/)
  })

  describe('assertChromeFirefoxManifestDelta', () => {
    const chromeBase = {
      action: { default_title: '__MSG_extensionName__' },
      content_security_policy: {
        extension_pages: createProductionExtensionCsp(3),
      },
      host_permissions: [
        'http://localhost:11434/*',
        'http://127.0.0.1:11434/*',
      ],
      incognito: 'not_allowed',
      manifest_version: 3,
      name: 'TABBIN',
      permissions: [
        'alarms',
        'tabs',
        'storage',
        'contextMenus',
        'notifications',
        'unlimitedStorage',
      ],
      version: '1.0.0',
    }
    const firefoxBase = {
      browser_action: { default_title: '__MSG_extensionName__' },
      browser_specific_settings: {
        gecko: { data_collection_permissions: { required: ['none'] } },
      },
      content_security_policy: createProductionExtensionCsp(2),
      incognito: 'not_allowed',
      manifest_version: 2,
      name: 'TABBIN',
      permissions: [
        'alarms',
        'tabs',
        'storage',
        'contextMenus',
        'notifications',
        'unlimitedStorage',
        'http://localhost:11434/*',
        'http://127.0.0.1:11434/*',
      ],
      version: '1.0.0',
    }

    it('accepts the expected Chrome MV3 / Firefox MV2 divergence', () => {
      expect(() =>
        assertChromeFirefoxManifestDelta(
          chromeBase,
          firefoxBase,
          'chrome.json',
          'firefox.json',
        ),
      ).not.toThrow()
    })

    it.each(['spanning', 'split'])(
      'rejects the shared %s incognito policy',
      (incognito) => {
        expect(() =>
          assertChromeFirefoxManifestDelta(
            { ...chromeBase, incognito },
            { ...firefoxBase, incognito },
            'chrome.json',
            'firefox.json',
          ),
        ).toThrow(/incognito must be "not_allowed"/)
      },
    )

    it('rejects divergent API permissions between Chrome and Firefox', () => {
      expect(() =>
        assertChromeFirefoxManifestDelta(
          {
            ...chromeBase,
            permissions: [...chromeBase.permissions, 'history'],
          },
          firefoxBase,
          'chrome.json',
          'firefox.json',
        ),
      ).toThrow(/API permissions diverge/)
    })

    it('rejects divergent host permissions between Chrome and Firefox', () => {
      expect(() =>
        assertChromeFirefoxManifestDelta(
          chromeBase,
          {
            ...firefoxBase,
            permissions: [
              ...firefoxBase.permissions,
              'https://api.example.com/*',
            ],
          },
          'chrome.json',
          'firefox.json',
        ),
      ).toThrow(/host permissions diverge/)
    })

    it('rejects an unexpected non-divergent key difference', () => {
      expect(() =>
        assertChromeFirefoxManifestDelta(
          { ...chromeBase, name: 'TABBIN-Changed' },
          firefoxBase,
          'chrome.json',
          'firefox.json',
        ),
      ).toThrow(/diverge on unexpected key "name"/)
    })

    it('rejects a Chrome manifest that is not MV3', () => {
      expect(() =>
        assertChromeFirefoxManifestDelta(
          { ...chromeBase, manifest_version: 2 },
          firefoxBase,
          'chrome.json',
          'firefox.json',
        ),
      ).toThrow(/chrome\.json.*manifest_version must be 3/)
    })

    it('rejects a Firefox manifest that is not MV2', () => {
      expect(() =>
        assertChromeFirefoxManifestDelta(
          chromeBase,
          { ...firefoxBase, manifest_version: 3 },
          'chrome.json',
          'firefox.json',
        ),
      ).toThrow(/firefox\.json.*manifest_version must be 2/)
    })

    it('rejects non-object manifests', () => {
      expect(() =>
        assertChromeFirefoxManifestDelta(
          null,
          firefoxBase,
          'chrome.json',
          'firefox.json',
        ),
      ).toThrow(/chrome and firefox manifests must be objects/)
      expect(() =>
        assertChromeFirefoxManifestDelta(
          chromeBase,
          null,
          'chrome.json',
          'firefox.json',
        ),
      ).toThrow(/chrome and firefox manifests must be objects/)
    })

    it('rejects an unexpected field on the Chrome action surface', () => {
      expect(() =>
        assertChromeFirefoxManifestDelta(
          { ...chromeBase, action: { default_title: 'X', extra: true } },
          firefoxBase,
          'chrome.json',
          'firefox.json',
        ),
      ).toThrow(/chrome\.json.*action surface.*unexpected field "extra"/)
    })

    it('rejects Chrome declaring browser_action', () => {
      expect(() =>
        assertChromeFirefoxManifestDelta(
          {
            ...chromeBase,
            browser_action: { default_title: '__MSG_extensionName__' },
          },
          firefoxBase,
          'chrome.json',
          'firefox.json',
        ),
      ).toThrow(/chrome\.json.*must not declare browser_action/)
    })

    it('rejects Firefox declaring action', () => {
      expect(() =>
        assertChromeFirefoxManifestDelta(
          chromeBase,
          {
            ...firefoxBase,
            action: { default_title: '__MSG_extensionName__' },
          },
          'chrome.json',
          'firefox.json',
        ),
      ).toThrow(/firefox\.json.*must not declare action/)
    })

    it('rejects a Chrome background extra field that Firefox does not have', () => {
      expect(() =>
        assertChromeFirefoxManifestDelta(
          {
            ...chromeBase,
            background: { service_worker: 'background.js', type: 'module' },
          },
          firefoxBase,
          'chrome.json',
          'firefox.json',
        ),
      ).toThrow(/Chrome and Firefox background diverge/)
    })

    it('rejects divergent action surface default_title between browsers', () => {
      expect(() =>
        assertChromeFirefoxManifestDelta(
          { ...chromeBase, action: { default_title: 'Chrome' } },
          firefoxBase,
          'chrome.json',
          'firefox.json',
        ),
      ).toThrow(/Chrome and Firefox action surface diverge/)
    })

    it('rejects a non-string background.service_worker', () => {
      expect(() =>
        assertChromeFirefoxManifestDelta(
          { ...chromeBase, background: { service_worker: 123 } },
          firefoxBase,
          'chrome.json',
          'firefox.json',
        ),
      ).toThrow(/chrome\.json.*background\.service_worker must be a string/)
    })

    it('rejects a non-string entry in background.scripts', () => {
      expect(() =>
        assertChromeFirefoxManifestDelta(
          chromeBase,
          { ...firefoxBase, background: { scripts: ['background.js', 123] } },
          'chrome.json',
          'firefox.json',
        ),
      ).toThrow(/firefox\.json.*background\.scripts must be a string array/)
    })

    it('rejects Chrome declaring browser_specific_settings', () => {
      expect(() =>
        assertChromeFirefoxManifestDelta(
          {
            ...chromeBase,
            browser_specific_settings: { gecko: { id: 'x' } },
          },
          firefoxBase,
          'chrome.json',
          'firefox.json',
        ),
      ).toThrow(/chrome\.json.*must not declare browser_specific_settings/)
    })

    it('rejects a Firefox browser_specific_settings structure change', () => {
      expect(() =>
        assertChromeFirefoxManifestDelta(
          chromeBase,
          {
            ...firefoxBase,
            browser_specific_settings: {
              gecko: {
                data_collection_permissions: { required: ['tech.data'] },
              },
            },
          },
          'chrome.json',
          'firefox.json',
        ),
      ).toThrow(
        /firefox\.json.*browser_specific_settings.*expected Firefox structure/,
      )
    })
  })
})
