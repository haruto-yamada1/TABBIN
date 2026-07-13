import path from 'node:path'

import { createProductionExtensionCsp } from '#production-network-policy'
import { describe, expect, it } from 'vitest'

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
  })

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
            'storage',
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
})
