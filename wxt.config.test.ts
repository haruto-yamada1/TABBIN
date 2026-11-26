import { createProductionExtensionCsp } from '#production-network-policy'
import { describe, expect, it } from 'vitest'

import wxtConfig from './wxt.config'

const getManifest = wxtConfig.manifest
if (typeof getManifest !== 'function') {
  throw new TypeError('Expected a WXT manifest factory')
}

describe.each([
  { browser: 'chrome', manifestVersion: 3 as const },
  { browser: 'firefox', manifestVersion: 2 as const },
])('$browser extension page CSP', (target) => {
  it('adds only the localhost HMR WebSocket source when serving', async () => {
    const manifest = await getManifest({
      ...target,
      command: 'serve',
      mode: 'development',
    })
    const csp = manifest.content_security_policy?.extension_pages
    const connectSources = csp
      ?.split('; ')
      .find((directive) => directive.startsWith('connect-src '))
      ?.split(' ')

    expect(connectSources).toContain('ws://localhost:*')
    expect(csp?.replace(' ws://localhost:*', '')).toBe(
      createProductionExtensionCsp(target.manifestVersion),
    )
  })

  it.each(['production', 'development'])(
    'uses the production CSP when building in %s mode',
    async (mode) => {
      const manifest = await getManifest({ ...target, command: 'build', mode })

      expect(manifest.content_security_policy?.extension_pages).toBe(
        createProductionExtensionCsp(target.manifestVersion),
      )
    },
  )
})
