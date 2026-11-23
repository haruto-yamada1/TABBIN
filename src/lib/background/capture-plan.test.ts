import { describe, expect, it } from 'vitest'

import type { CaptureScope } from './capture-plan'
import { createCapturePlan } from './capture-plan'

const tab = (
  id: number,
  url: string,
  properties: Partial<chrome.tabs.Tab> = {},
): chrome.tabs.Tab =>
  ({ id, url, active: false, pinned: false, ...properties }) as chrome.tabs.Tab

const policy = {
  excludePinnedTabs: true,
  excludePatterns: ['   blocked   ', ' '],
}

describe('capture plan', () => {
  it.each<{
    scope: CaptureScope
    included: number[]
  }>([
    { scope: 'saveCurrentTab', included: [1] },
    { scope: 'saveSameDomainTabs', included: [1, 2] },
    { scope: 'saveWindowTabs', included: [1, 2, 3] },
    { scope: 'saveAllWindowsTabs', included: [1, 2, 3, 8] },
    { scope: 'selectedTabs', included: [2, 3] },
  ])(
    '$scope keeps close targets within its eligible source IDs',
    ({ scope, included }) => {
      const active = tab(1, 'https://example.test/active', { active: true })
      const sameDomain = tab(2, 'http://example.test/same-domain')
      const anotherDomain = tab(3, 'https://other.test/')
      const pinned = tab(4, 'https://example.test/pinned', { pinned: true })
      const excluded = tab(5, 'https://example.test/blocked')
      const invalid = tab(6, 'not an absolute URL')
      const extension = tab(7, 'moz-extension://tabbin/saved-tabs.html')
      const anotherWindow = tab(8, 'https://another.test/')
      const currentWindow = [
        active,
        sameDomain,
        anotherDomain,
        pinned,
        excluded,
        invalid,
        extension,
      ]
      let source = currentWindow
      if (scope === 'selectedTabs') {
        source = [sameDomain, anotherDomain, pinned, excluded, extension]
      } else if (scope === 'saveAllWindowsTabs') {
        source = [...currentWindow, anotherWindow]
      }
      const plan = createCapturePlan(scope, source, policy)

      expect(plan.sourceTabIds).toEqual(source.map(({ id }) => id))
      expect(plan.includedTabIds).toEqual(included)
      expect(plan.closeTargetIds).toEqual(included)
    },
  )

  it('copies the policy and tab fields and records why tabs were ineligible', () => {
    const settings = { ...policy, excludePatterns: [...policy.excludePatterns] }
    const tabs = [
      tab(1, 'https://example.test/'),
      tab(2, 'https://example.test/', { pinned: true }),
      tab(3, 'https://example.test/blocked'),
      tab(4, 'https://example.test/', {
        pendingUrl: 'chrome-extension://tabbin/saved-tabs.html',
      }),
      tab(5, 'broken'),
    ]
    const plan = createCapturePlan('saveWindowTabs', tabs, settings)
    const active = tabs[0]
    if (active) {
      active.url = 'https://example.test/changed'
    }
    tabs.push(tab(6, 'https://example.test/late'))
    settings.excludePatterns.push('example.test')

    expect(plan.includedTabs[0]?.url).toBe('https://example.test/')
    expect(plan.sourceTabIds).toEqual([1, 2, 3, 4, 5])
    expect(plan.settingsPolicy.excludePatterns).toEqual(policy.excludePatterns)
    expect(plan.excludedReasons).toEqual([
      { tabId: 2, reason: 'pinned' },
      { tabId: 3, reason: 'url-policy' },
      { tabId: 4, reason: 'extension-page' },
      { tabId: 5, reason: 'url-policy' },
    ])
    expect(Object.isFrozen(plan.includedTabs[0])).toBe(true)
  })

  it('supports save-only and preserves pinned or unidentified tabs', () => {
    const settings = { ...policy, excludePinnedTabs: false }
    const targets = [
      tab(1, 'https://example.test/'),
      tab(2, 'https://example.test/pinned', { pinned: true }),
      tab(-1, 'https://example.test/unknown-id'),
    ]
    const standard = createCapturePlan('selectedTabs', targets, settings)
    const saveOnly = createCapturePlan('selectedTabs', targets, settings, false)

    expect(standard.includedTabs).toHaveLength(3)
    expect(standard.includedTabIds).toEqual([1, 2])
    expect(standard.closeTargetIds).toEqual([1])
    expect(saveOnly.includedTabs).toEqual(standard.includedTabs)
    expect(saveOnly.closeTargetIds).toEqual([])
  })

  it('fails closed on malformed exclusion patterns', () => {
    const settings = { ...policy, excludePatterns: [42] as unknown as string[] }
    expect(() => createCapturePlan('saveWindowTabs', [], settings)).toThrow(
      expect.objectContaining({ reason: 'invalid-exclude-patterns' }),
    )
  })
})
