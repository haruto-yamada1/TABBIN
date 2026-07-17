import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '../../..')

const isExcluded = (relativePath: string, name: string): boolean =>
  name.endsWith('.test.ts') ||
  name.endsWith('.test.tsx') ||
  name.endsWith('.spec.ts') ||
  relativePath.includes('/storybook/') ||
  relativePath.includes('/__stories__/')

const collectSourceFiles = (relativeDir: string): string[] => {
  const results: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(resolve(repoRoot, dir))) {
      const relative = `${dir}/${name}`
      const absolute = resolve(repoRoot, relative)
      if (statSync(absolute).isDirectory()) {
        walk(relative)
      } else if (
        (name.endsWith('.ts') || name.endsWith('.tsx')) &&
        !isExcluded(relative, name)
      ) {
        results.push(relative)
      }
    }
  }
  walk(relativeDir)
  return results
}

describe('issue #676: runtime messaging trust boundary guards', () => {
  const untrustedSenderApis = ['onMessageExternal', 'onConnectExternal']

  it('production source does not register external message listeners without a trust-boundary review', () => {
    const offenders: string[] = []
    for (const path of collectSourceFiles('src')) {
      const source = readFileSync(resolve(repoRoot, path), 'utf8')
      for (const api of untrustedSenderApis) {
        if (source.includes(api)) {
          offenders.push(`${path}: ${api}`)
        }
      }
    }
    expect(
      offenders,
      'External sender listeners require a trust-boundary review. See docs/security/messaging-trust-boundary.md before adding onMessageExternal / onConnectExternal.',
    ).toEqual([])
  })

  it('wxt.config.ts does not declare externally_connectable or content_scripts without a trust-boundary review', () => {
    const configSource = readFileSync(
      resolve(repoRoot, 'wxt.config.ts'),
      'utf8',
    )
    for (const surface of ['externally_connectable', 'content_scripts']) {
      expect(
        configSource,
        `${surface} requires a trust-boundary review. See docs/security/messaging-trust-boundary.md.`,
      ).not.toContain(surface)
    }
  })

  it('docs/security/messaging-trust-boundary.md documents the sender trust levels and review triggers', () => {
    const doc = readFileSync(
      resolve(repoRoot, 'docs/security/messaging-trust-boundary.md'),
      'utf8',
    )
    expect(doc).toContain('Sender types and trust levels')
    expect(doc).toContain('Privileged actions')
    expect(doc).toContain('Trust-boundary review triggers')
    expect(doc).toContain('Migration control key trust boundary')
    expect(doc).toMatch(/onMessageExternal/)
    expect(doc).toMatch(/externally_connectable/)
    expect(doc).toMatch(/content_scripts/)
  })

  it('docs/security/permissions.md documents each approved permission and the generated-manifest invariants', () => {
    const doc = readFileSync(
      resolve(repoRoot, 'docs/security/permissions.md'),
      'utf8',
    )
    for (const permission of [
      'alarms',
      'tabs',
      'storage',
      'contextMenus',
      'notifications',
      'unlimitedStorage',
      'http://localhost:11434/*',
      'http://127.0.0.1:11434/*',
    ]) {
      expect(doc).toContain(permission)
    }
    expect(doc).toContain('Generated manifest security invariants')
    expect(doc).toContain('externally_connectable')
    expect(doc).toContain('content_scripts')
    expect(doc).toContain('web_accessible_resources')
    expect(doc).toContain('assertChromeFirefoxManifestDelta')
  })

  it('generated-manifest verifier enforces the trust-boundary manifest invariants', () => {
    const invariants = readFileSync(
      resolve(repoRoot, 'tools/scripts/manifestSecurityInvariants.ts'),
      'utf8',
    )
    expect(invariants).toContain('externally_connectable')
    expect(invariants).toContain('content_scripts')
    expect(invariants).toContain('web_accessible_resources')
    expect(invariants).toContain('assertChromeFirefoxManifestDelta')
    // The main verifier wires the invariant checks into the per-manifest assertion.
    const verifier = readFileSync(
      resolve(repoRoot, 'tools/scripts/production-network-policy.ts'),
      'utf8',
    )
    expect(verifier).toContain('assertGeneratedManifestSecurityInvariants')
    expect(verifier).toContain(
      'assertExtensionCspMatchesProductionNetworkPolicy',
    )
  })
})
